let fs = require('fs');
let moment = require('moment');
let sharp = require('sharp');
let { Builder, By, Key, until } = require('selenium-webdriver');

let baseUrl = 'https://www.cineworld.ie/films/avengers-endgame/{movieId}#/buy-tickets-by-film?in-cinema=8013&at={date}&for-movie={movieId}&filtered=imax&view-mode=list';
let configFile = 'build/config.json';
let timeout = 5000;

async function main() {
    await scrape();
}

async function scrape() {
    let config = JSON.parse(fs.readFileSync(configFile));

    let startDate = moment(config.startDate);
    let endDate = moment(config.endDate);
    baseUrl = baseUrl.replace(/{movieId}/g, config.movieId);

    let driver = await new Builder().forBrowser('chrome').build();

    await driver.get('https://www.cineworld.ie/');
    for (let cookie of config.cookies) {
        await driver.manage().addCookie(cookie);
    }
    await driver.navigate().refresh();

    try {
        for (let currDate = startDate; currDate <= endDate; currDate = currDate.add(1, 'days')) {
            let currDateStr = currDate.format('YYYY-MM-DD');
            let url = baseUrl.replace('{date}', currDateStr);

            await driver.get(url);

            await driver.wait(until.elementLocated(By.css('div.qb-movie-info-column a.btn')));
            let times = await driver.executeScript(getTimes);

            for (let time of times) {
                console.log(`Entering ${currDateStr} ${time}`);

                await driver.get(url);

                await driver.wait(until.elementLocated(By.css('div.qb-movie-info-column a.btn')));
                await driver.executeScript(clickTime, time);

                await driver.wait(until.elementLocated(By.css('select.ticket-select')));
                await driver.executeScript(clickTicketQuantity);

                try {
                    await driver.wait(until.elementLocated(By.css('div.screen_area')));
                }
                catch (ex) {
                    // Tickets sold out
                    continue;
                }

                await driver.sleep(1000); // Finish animation
                await driver.executeScript(clickSelectedSeat);

                let screenArea = await driver.findElement(By.css('div.screen_area'));
                let { x, y, width, height } = await screenArea.getRect();

                let timeEscaped = time.replace(':', '-');
                let fullFilePath = `build/${currDateStr}_${timeEscaped}_full.png`;
                let filePath = `build/${currDateStr}_${timeEscaped}.png`;

                let data = await driver.takeScreenshot();
                let base64Data = data.replace(/^data:image\/png;base64,/, '');
                fs.writeFileSync(fullFilePath, base64Data, 'base64');

                sharp(fullFilePath)
                    .extract({ left: Math.floor(x), top: Math.floor(y), width: Math.ceil(width + 1), height: Math.ceil(height + 1) })
                    .toFile(filePath);

                fs.unlinkSync(fullFilePath);
            }
        }

        await driver.quit();
    }
    catch (ex) {
        console.error(ex);

        //await driver.quit();
    }
}

function getTimes() {
    return $('div.qb-movie-info-column a.btn')
        .map((_, tagNode) => tagNode.innerText)
        .get();
}

function clickTime(time) {
    $(`div.qb-movie-info-column a.btn:contains("${time}")`)[0].click();
}

function clickTicketQuantity() {
    $('select.ticket-select:first').val('1').change();
    $('button.confirm-tickets2')[0].click();
}

function clickSelectedSeat() {
    $('div.screen_area img[src="/img/seats/choosen-person.png"]').click();
}

main();
