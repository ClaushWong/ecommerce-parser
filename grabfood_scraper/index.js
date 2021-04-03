require('dotenv').config()

const express = require("express")
const fetch = require("node-fetch")
const puppeteer = require("puppeteer")
const cheerio = require("cheerio")

const app = express()
const PORT = 3000

function replaceText(keyword) {
    // replace % with %25
    let temp = keyword.replace(/%/g, '%25')
    // replace Space with %20
    temp = temp.replace(/\s/g, '%20')
    // replace " with %22
    temp = temp.replace(/\"/g, '%22')
    // replace < with %3C
    temp = temp.replace(/</g, '%3C')
    // replace > with %3E
    temp = temp.replace(/>/g, '%3E')
    // replace # with %23
    temp = temp.replace(/#/g, '%23')
    // replace | with %7C
    temp = temp.replace(/\|/g, '%7C')
    // return encodedURL
    return temp
}

async function requestMerchants(link) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    console.log(`Run: ${link}`)
    await page.goto(link, {
        waitUntil: 'networkidle0',
    })

    let html = await page.content()
    await browser.close()

    return html
}

app.get("/", (_,res) => {
    res.sendFile( __dirname + "/index.html")
})

app.get("/search/:keyword", (req,res) => {
    let keyword = req.params.keyword
    keyword = replaceText(keyword)
    let link = process.env.CLIENT_URL + `restaurants?search=${keyword}`
    requestMerchants(link).then(data => {
        const $ = cheerio.load(data)
        let infos = []
        $('.RestaurantListCol___1FZ8V a').each((_, value) => {
            let link = $(value).attr('href')
            link = link.split('/')
            let details = $(value).find('.numbers___2xZGn').text().split("•")
            let p_data = {
                'duration': details[0],
                'distance': details[1]
            }
            infos.push({
                'name': $(value).find('.name___2epcT').text(),
                'tags': $(value).find('.cuisine___T2tCh').text(),
                'rating': $(value).find('.numbers___2xZGn').contents().first().text(),
                'details': p_data,
                'merchantId': link[link.length - 1]
            })
        })
        res.status(200).send({'output': infos})
    })
})

app.post("/data/:merchantID", (req,res) => {
    let merchantID = req.params.merchantID
    let link = process.env.PORTAL_URL + `foodweb/v2/order/merchants/${merchantID}`
    fetch(link, {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': process.env.AUTHORIZATION,
            'x-gfc-session': process.env.PORTAL_SESSION
        }
    })
    .then(res => res.json())
    .then(data => {
        res.status(200).send({'data': data})
    })
    .catch(err => res.status(400).send({'error': err}))
})

app.listen(PORT, () => console.log(`Listening to port ${PORT}`))