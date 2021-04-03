const puppeteer = require('puppeteer')

const express = require('express')
const cors = require('cors')
const app = express()
const http = require('http').createServer(app)

app.use(cors())

const USD_TO_MYR = 4.11

async function getRankingKeyword(count, res) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    let link = "https://www.aliexpress.com"
    await page.goto(link)
    const data = await page.evaluate(() => runParams)
    let ranking = JSON.parse(data.rankingKeywords)
    // get top 10 highest weight
    let top_ten_ranking_keyword = ranking.slice(0,count)
    
    // pre-process the keyword items
    for(let i = 0; i < top_ten_ranking_keyword.length; i++) {
        let linkURL = top_ten_ranking_keyword[i].linkUrl
        linkURL = linkURL.split('/')
        top_ten_ranking_keyword[i].catId = linkURL[linkURL.length-2]
        let modKey = top_ten_ranking_keyword[i]['keyword'].replace(/\s/g, "-")
        top_ten_ranking_keyword[i]['keyword'] = modKey
        delete top_ten_ranking_keyword[i]['oldWeight']
    }
    // return results
    res.send(top_ten_ranking_keyword) 
}

async function getProducts(link) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.goto(link)
    const data = await page.evaluate(() => runParams)
    
    let return_item = {}
    
    let item_content = []
    let boughtRateData = []

    let boughtRate = data.refinePrice.priceRanges
    let items_list = data.items

    if (boughtRate != undefined) {
        for (let priceRangeIndex = 0; priceRangeIndex < boughtRate.length; priceRangeIndex++) {
            let content = {
                "startPrice (RM)": Math.round(parseFloat(boughtRate[priceRangeIndex].startPrice) * USD_TO_MYR),
                "endPrice (RM)": boughtRate[priceRangeIndex].endPrice == undefined ? "None" : Math.round(parseFloat(boughtRate[priceRangeIndex].endPrice) * USD_TO_MYR),
                "rate": (parseFloat(boughtRate[priceRangeIndex].boughtRate)).toFixed(2)
            }
            boughtRateData.push(content)
        }
    }

    let ratings = 0.0
    let total_orders = 0
    let average_selling_price = 0.0

    for (let j = 0 ; j < 60; j++) {
        let content = {
            "id": j+1,
            "title": items_list[j].title,
            "shippingInfo": items_list[j].logisticsDesc,
            "starRating": items_list[j].starRating == undefined ? "None" : items_list[j].starRating,
            "productDetailUrl": (items_list[j].productDetailUrl).split("?")[0]
        }

        
        ratings += content['starRating'] == "None" ? 0.0 : parseFloat(content['starRating'])

        if (boughtRate != undefined) {
            content['group'] = grouping_brought_rate(boughtRateData, content['averagePrice (RM)'])
        }

        let salesPrice = items_list[j].umpPrices.sale_price
        content['minPrice (RM)'] = salesPrice != undefined ? (salesPrice.minPrice * USD_TO_MYR).toFixed(2) : "None"
        content['maxPrice (RM)'] = salesPrice != undefined ? (salesPrice.maxPrice * USD_TO_MYR).toFixed(2) : "None"
        content['averagePrice (RM)'] = ((parseFloat(content['minPrice (RM)']) + parseFloat(content['maxPrice (RM)'])) / 2.0).toFixed(2)

        average_selling_price += parseFloat(content['averagePrice (RM)'])

        let orders = items_list[j].tradeDesc
        let totalOrders = 0
        if (orders != undefined) {
            let formatted_orders = orders.split(" ")
            totalOrders = parseInt(formatted_orders[0])
            total_orders += totalOrders
        }
        content['orders'] = totalOrders
        item_content.push(content)
    }

    browser.close()

    return_item['boughtRate'] = boughtRateData
    return_item['items'] = item_content
    return_item['avg_starRating'] = (ratings / 60.0).toFixed(2)
    return_item['totalSales'] = total_orders
    return_item['avg_sellPrice'] = (average_selling_price / 60.0).toFixed(2)

    return return_item
}

function grouping_brought_rate(bought_rate_data, price) {
    price_num = parseFloat(price)
    for (let i = 0; i < bought_rate_data.length-1; i++) {
        min_range = parseFloat(bought_rate_data[i]['startPrice (RM)'])
        max_range = parseFloat(bought_rate_data[i]['endPrice (RM)'])
        if (price_num > min_range && price_num < max_range) {
            return i
        }
    }
    return bought_rate_data.length - 1
}

async function getMultiPageProducts(links) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    
    let return_item = {}

    let item_content = []
    let boughtRateData = []

    let ratings = 0.0
    let total_orders = 0
    let average_selling_price = 0.0
    for (let i = 0 ; i < links.length; i++) {
        await page.goto(links[i])
        const data = await page.evaluate(() => runParams)
        let items_list = data.items
        let boughtRate = data.refinePrice.priceRanges

        if (i == 0 && boughtRate != undefined) {
            for (let priceRangeIndex = 0; priceRangeIndex < boughtRate.length; priceRangeIndex++) {
                let content = {
                    "startPrice (RM)": Math.round(parseFloat(boughtRate[priceRangeIndex].startPrice) * USD_TO_MYR),
                    "endPrice (RM)": boughtRate[priceRangeIndex].endPrice == undefined ? "None" : Math.round(parseFloat(boughtRate[priceRangeIndex].endPrice) * USD_TO_MYR),
                    "rate": (parseFloat(boughtRate[priceRangeIndex].boughtRate)).toFixed(2)
                }
                boughtRateData.push(content)
            }
        }
        
        for (let j = 0 ; j < 60; j++) {
            let content = {
                "id": (i*60) + (j+1),
                "title": items_list[j].title,
                "shippingInfo": items_list[j].logisticsDesc == undefined ? "None" : items_list[j].logisticsDesc,
                "starRating": items_list[j].starRating == undefined ? "None" : items_list[j].starRating,
                "productDetailUrl": (items_list[j].productDetailUrl).split("?")[0]
            }

            ratings += content['starRating'] == "None" ? 0.0 : parseFloat(content['starRating'])

            let salesPrice = items_list[j].umpPrices.sale_price
            content['minPrice (RM)'] = salesPrice != undefined ? (salesPrice.minPrice * USD_TO_MYR).toFixed(2) : "None"
            content['maxPrice (RM)'] = salesPrice != undefined ? (salesPrice.maxPrice * USD_TO_MYR).toFixed(2) : "None"
            content['averagePrice (RM)'] = ((parseFloat(content['minPrice (RM)']) + parseFloat(content['maxPrice (RM)'])) / 2.0).toFixed(2)

            average_selling_price += parseFloat(content['averagePrice (RM)'])

            if (boughtRate != undefined) {
                content['group'] = grouping_brought_rate(boughtRateData, content['averagePrice (RM)'])
            }

            let orders = items_list[j].tradeDesc
            let totalOrders = 0
            if (orders != undefined) {
                let formatted_orders = orders.split(" ")
                totalOrders = parseInt(formatted_orders[0])
                total_orders += totalOrders
            }
            content['orders'] = totalOrders

            item_content.push(content)
        }
    }
    browser.close()

    return_item['boughtRate'] = boughtRateData
    return_item['items'] = item_content
    return_item['avg_starRating'] = (ratings / (60.0 * links.length)).toFixed(2)
    return_item['totalSales'] = total_orders
    return_item['avg_sellPrice'] = (average_selling_price / (60.0*links.length)).toFixed(2)

    return return_item
}

app.get('/data/aliexpress/search/total/:keyword/:totalPage', (req, res) => {
    let keyword = req.params.keyword
    let total_page = req.params.totalPage
    let links = []
    for (let i = 1; i <= total_page; i++) {
        links.push(`https://www.aliexpress.com/wholesale?SearchText=${keyword}&page=${i}&SortType=total_tranpro_desc`)
    }
   getMultiPageProducts(links).then(data => {
       res.send(data)
   })
})

app.get('/data/aliexpress/search/:keyword/:page', (req,res) => {
    let keyword = req.params.keyword
    let page = req.params.page
    let link = `https://www.aliexpress.com/wholesale?SearchText=${keyword}&page=${page}&SortType=total_tranpro_desc`
    getProducts(link).then(data => {
        res.send(data)
    })
})

app.get('/data/aliexpress/category/total/:catId/:totalPage', (req,res) => {
    let catId = req.params.catId
    let total_page = req.params.totalPage
    let links = []
    for (let i = 1; i <= total_page; i++) {
        links.push(`https://www.aliexpress.com/wholesale?SortType=total_tranpro_desc&page=${i}&catId=${catId}`)
    }
    getMultiPageProducts(links).then(data => {
        res.send(data)
    })
})

app.get('/data/aliexpress/category/:catId/:page', (req,res) => {
    let catId = req.params.catId
    let page = req.params.page
    let link = `https://www.aliexpress.com/wholesale?SortType=total_tranpro_desc&page=${page}&catId=${catId}`
    getProducts(link).then(data => {
        res.send(data)
    })
})

app.get('/data/aliexpress/topRankingKeyword/:count', (req,res) => {
    let count = req.params.count
    getRankingKeyword(count, res)
})

http.listen(3000, (_) => {
    console.log('Listening to port 3000')
  }
)