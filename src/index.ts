const asyncRedis = require('async-redis');
import dayjs from 'dayjs';
import express from 'express';
import fs from 'fs';
import {calendar_v3, google} from 'googleapis';
import {getLogger} from './logger';

const logger = getLogger('Calendaring');
const config = JSON.parse(fs.readFileSync('./config.json').toString());
let cache: any;
cache = asyncRedis.createClient(config.REDIS_URL);
cache.on('error', () => {
    logger.warn('Working without cache!!');
});

const app = express();
const oauth2Client = new google.auth.OAuth2(
    config.CLIENT_ID,
    config.CLIENT_SECRET,
    config.REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: config.REFESH_TOKEN
});

const calendarClient = google.calendar({
    auth: oauth2Client,
    version: 'v3'
});

class CalendaringEvent {
    public date: string;
    public holiday_name: string;
    public holiday_locations?: string[];
    constructor(name: string, date: string, holidayLocations: string[] | null) {
        this.holiday_name = name;
        this.date = date;
        if(holidayLocations) this.holiday_locations = holidayLocations;
    }
}

async function getEventsForDate(fromDate: dayjs.Dayjs, toDate: dayjs.Dayjs, language: string, country: string): Promise<CalendaringEvent[]> {
    const stringFromDate = fromDate.toISOString();
    const stringToDate = toDate.toISOString();
    logger.debug('stringToDate:', stringToDate);
    logger.debug('stringFromDate:', stringFromDate);
    const cacheKey = `${language}-${country}-${stringFromDate}-${stringToDate}`;
    let cached: string | undefined;
    if (cache.ready) cached = await cache.get(cacheKey);

    if (cached) {
        logger.debug('Cache hit!');
        return JSON.parse(cached) as CalendaringEvent[];
    } else {
        const {data} = await calendarClient.events.list({
            calendarId: `${language.toLowerCase()}.${country.toLowerCase()}#holiday@group.v.calendar.google.com`,
            timeMax: stringToDate,
            timeMin: stringFromDate
        });
        const returnData = (data.items as calendar_v3.Schema$Event[]).map(({start, summary, description}) => 
            new CalendaringEvent(
                summary as string,
                (start as calendar_v3.Schema$EventDateTime).date as string,
                description ? description.split(':').splice(1).join(':').split(',').map(e => e.trim()) : null
            )
        ).filter(e => e.holiday_locations); // hypothesis: google has locations only if is bank holiday
        if (cache.ready) cache.set(cacheKey, JSON.stringify(returnData)).then(() => cache.expire(cacheKey, 3600 * 24));
        return returnData;
    }
};

app.get('/', (req, res) => {
    res.send('Main endpoint is /get<br>Parameters are:<br> - fromDate<br> - toDate<br> - language<br> - country');
    res.end();
});

app.get('/get', async (req, res) => {
    logger.debug('req:', req.query);
    const {fromDate, toDate, language, country} = req.query;
    const parsedFromDate = dayjs(fromDate);
    const parsedToDate = dayjs(toDate);
    logger.debug('fromDate:', fromDate);
    logger.debug('toDate:', toDate);
    logger.debug('parsedFromDate:', parsedFromDate);
    logger.debug('parsedToDate:', parsedToDate);
    getEventsForDate(parsedFromDate, parsedToDate, language, country).then(events => {
        res.json(events);
        res.end();
    }).catch(err => {
        res.statusCode = 400;
        res.json({error: 'unknown'});
        res.end();
    });
});

process.env.PORT = process.env.PORT || '3000';

app.listen(process.env.PORT, () => {
    logger.info('Listening on port', process.env.PORT);
});
  