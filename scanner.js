const axios = require("axios")
const fs = require('fs').promises
const TelegramBot = require('node-telegram-bot-api')

const mpACategories = {
    ComputersEnSoftware: 322,
    SpelcomputersGames: 356
}
const mpBCategories = {
    MiniLaptops: 2077,
    Laptops: 339,
}

let ads = [] // new ads in every 'round' of scanning
let lastAds = [] // all remembered ad IDs
let telegramInfo = null
let telegramBot = null

const load = async function() {
    await fs.readFile('lastAds.json').then(function(file) {
        lastAds = JSON.parse(file)
    }).catch(function(err) {
        lastAds = []
    })
    await fs.readFile('telegram_credentials.json').then(function(file) {
        telegramInfo = JSON.parse(file)
        if(telegramInfo.chatId == -1) {
            console.log('No settings or invalid Telegram settings detected. Please check token, chatId, and minimumPriceCents in telegram_credentials.json')
            telegramInfo = null
            return
        }
        telegramBot = new TelegramBot(telegramInfo.token, {polling: false})
    }).catch(async function(err) {
        telegramInfo = null
        console.log('Wrote default settings to telegram_credentials, please modify them.')
        await fs.writeFile('telegram_credentials.json', JSON.stringify({token: 'INSERT_TELEGRAM_API_TOKEN_HERE', chatId: -1, minimumPriceCents: 20000})) // minimum price 200 eur by default
    })
}

const searchMarktplaats = (categoryOne, categoryTwo, sortBy="SORT_INDEX", sortOrder="DECREASING", offset=0, limit = 10) => {
    return new Promise(async function(resolve, reject) {
        let url = `https://www.marktplaats.nl/lrp/api/search?l1CategoryId=${categoryOne}&l2CategoryId=${categoryTwo}&limit=${limit}&offset=${offset}&sortBy=${sortBy}&sortOrder=${sortOrder}&viewOptions=list-view`
        try {
          const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36' }  })
          const data = response.data
          resolve({totalResults: data.totalResultCount, listings: data.listings })
        } catch (error) {
          reject(error)
        }
    })
}

async function getLaptopAds() {
    let res = await searchMarktplaats(mpACategories.ComputersEnSoftware, mpBCategories.Laptops, "SORT_INDEX", "DECREASING", 0, 100)
    console.log(`Found ${res.totalResults} ads`)

    // Search all pages
    for(let i = 100; i < res.totalResults; i = i + 100) {
        let entries = res.listings.filter(listing => (listing.itemId[0] != 'a' && !lastAds.includes(listing.itemId)))
        if(entries.length == 0) break

        for(let l = 0; l < entries.length; l++) { // Non-duplicate, non-ads product offerings
            lastAds.push(entries[l].itemId)
            ads.push(entries[l])
        }
        res = await searchMarktplaats(mpACategories.ComputersEnSoftware, mpBCategories.Laptops, "SORT_INDEX", "DECREASING", i, 100) // Next page
    }

    for(let i = 0; i < ads.length; i++) {
        let m = ads[i]
        let text = new Date().toUTCString() + ": " + m.title + ": €" + m.priceInfo.priceCents / 100 + " http://marktplaats.nl" + m.vipUrl + " " + m.location.cityName // format a message for the user
        console.log(text)
        if(telegramInfo !== null) {
            if(ads.length <= 5 && (m.priceInfo.priceCents == 0 || m.priceInfo.priceCents < telegramInfo.maxPriceCents)) {
                telegramBot.sendMessage(telegramInfo.chatId, text);
                if(m.imageUrls != null && m.imageUrls.length > 1) m.imageUrls.map(u => "http:" + u).forEach(u => {
                    if(u != m.imageUrls[0]) telegramBot.sendPhoto(telegramInfo.chatId, u) // Send other product picture(s)
                })
            }
        }
    }
    if(ads.length > 0) {
        await fs.writeFile('lastAds.json', JSON.stringify(lastAds))
        console.log(`Got ${ads.length} new ads. Already known ads: ${lastAds.length}`)
    }
    ads = []
}

async function start() {
    console.log('Starting Marktplaats scanner and printing ads.')
    await load()
    await getLaptopAds()
    setInterval(async function() {
        await getLaptopAds()
    }, 90000)
}
start()