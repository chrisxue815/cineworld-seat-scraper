let fs = require('fs');
let moment = require('moment');
let webdriverio = require('webdriverio');

let baseUrl = 'https://www.cineworld.ie/films/avengers-endgame/{movieId}#/buy-tickets-by-film?in-cinema=8013&at={date}&for-movie={movieId}&filtered=imax&view-mode=list';
let configFile = 'build/config.json';
let timeout = 5000;

async function main() {
    await scrape();
}

async function scrape() {
    let config = JSON.parse(fs.readFileSync(configFile));

    startDate = moment(config.startDate);
    endDate = moment(config.endDate);
    baseUrl = baseUrl.replace(/{movieId}/g, config.movieId);

    let browser = await webdriverio.remote({
        capabilities: {
            browserName: 'chrome',
        },
    });

    let $ = browser.$.bind(browser);
    await browser.setTimeout({ implicit: timeout, script: timeout });

    await browser.url('https://www.cineworld.ie/');
    await browser.setCookies(config.cookies);
    await browser.refresh();

    try {
        for (let currDate = startDate; currDate <= endDate; currDate = currDate.add(1, 'days')) {
            let currDateStr = currDate.format('YYYY-MM-DD');
            let url = baseUrl.replace('{date}', currDateStr);

            await browser.url(url);

            await (await $('a.btn-sm')).waitForExist();
            let times = await browser.execute(getTimes);

            for (let time of times) {
                console.log(`Entering ${currDate} ${time}`);

                await browser.url(url);

                await (await $('a.btn-sm')).waitForExist();
                await browser.execute(clickTime, time);

                await (await $('select.ticket-select')).waitForExist();
                await browser.execute(clickTicketQuantity);

                try {
                    await (await $('div.screen_area')).waitForDisplayed();
                }
                catch (ex) {
                    // Tickets sold out
                    continue;
                }

                await browser.pause(500);
                await browser.execute(clickSelectedSeat);
                await browser.pause(500);

                let timeEscaped = time.replace(':', '-');
                await (await $('div.screen_area')).saveScreenshot(`build/${currDateStr}_${timeEscaped}.png`);
            }
        }

        await browser.deleteSession();
    }
    catch (ex) {
        console.error(ex);

        //await browser.deleteSession();
    }
}

function getTimes() {
    return $('a.btn-sm')
        .map((_, tagNode) => tagNode.innerText)
        .get();
}

function clickTime(time) {
    $(`a.btn-sm:contains("${time}")`)[0].click();
}

function clickTicketQuantity() {
    $('select.ticket-select:first').val('1').change();
    $('button.confirm-tickets2')[0].click();
}

function clickSelectedSeat() {
    $('div.screen_area img[src="/img/seats/choosen-person.png"]').click();
}

main();
