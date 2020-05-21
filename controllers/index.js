var EventEmitter = require('events').EventEmitter;
var moment = require('moment');
var consts = require('../consts');
var rp = require('request-promise');

exports.homeController = function(req, res, next) {
    res.send("<h1>Welcome to our API</h1><p>Use /api endpoint to access out api!</p>");
}

exports.apiController = function(req, res, next) {
    // start workflow
    let workflow = new EventEmitter();

    // first extract the parameters
    workflow.on(consts.workflow.fetchParameters, function fetchParameters() {

        var params = req.params || {};

        workflow.emit(consts.workflow.processParams, params);
    });

    workflow.on(consts.workflow.processParams, function processParams(params) {
        // #1. process the month year and day 
        var monthData = params.month; // example: 201902
        // format the date in YYYY-MM-01 // get the first date of the current month
        // year - month - 01 (day)
        monthData = monthData.substr(0, 4) + "-" + monthData.substr(4, 2) + "-" + "01";

        // get the dates for API fetching
        var startOfCurrentMonthDate = moment(monthData).format('YYYYMMDD');
        var endOfCurrentMonthDate = moment(monthData).endOf('month').format('YYYYMMDD');
        var startOfPreviousMonthDate = moment(monthData).subtract(1, 'months').format("YYYYMMDD");
        var endOfPreviousMonthDate = moment(monthData).subtract(1, 'months').endOf('month').format('YYYYMMDD');

        // #2. extract the type of data 
        var product = params.typeOfData;

        // #3. get station id
        var station = params.stationNumber;


        // trigger the API fetching 
        workflow.emit(consts.workflow.fetchCurrentMonthData, {
            startOfCurrentMonthDate,
            endOfCurrentMonthDate,
            startOfPreviousMonthDate,
            endOfPreviousMonthDate,
            product,
            station,
        });
    });


    workflow.on(consts.workflow.fetchCurrentMonthData, function fetchCurrentMonthData(dataParams) {
        // fetch the current month
        fetchFromAPI({
            startDate: dataParams.startOfCurrentMonthDate,
            endDate: dataParams.endOfCurrentMonthDate,
            station: dataParams.station,
            product: dataParams.product
        }, function(err, currentMonthData) {
            if (err) {
                return res.status(500).send({ error: err });
            } else if (currentMonthData.error) {
                return res.status(500).send({ error: currentMonthData.error.message });
            }

            // fetch the previous data
            workflow.emit(consts.workflow.fetchPreviousMonthData, dataParams, currentMonthData);
        });
    });

    workflow.on(consts.workflow.fetchPreviousMonthData, function fetchPreviousMonthData(dataParams, currentMonthData) {
        // fetch the current month
        fetchFromAPI({
            startDate: dataParams.startOfPreviousMonthDate,
            endDate: dataParams.endOfPreviousMonthDate,
            station: dataParams.station,
            product: dataParams.product
        }, function(err, previousMonthData) {
            if (err) {
                return res.status(500).send({ error: err });
            } else if (previousMonthData.error) {
                return res.status(500).send({ error: previousMonthData.error.message });
            }

            // concatinate the previous and current month data
            var presentableData = {
                metadata: currentMonthData.metadata,
                maximumValueOfTheMonth: currentMonthData.max,
                minimumValueOfTheMonth: currentMonthData.min,
                averageValueOfTheMonth: currentMonthData.avg,

                maximumValueOfThePreviousMonth: previousMonthData.max,
                minimumValueOfThePreviousMonth: previousMonthData.min,
                averageValueOfThePreviousMonth: previousMonthData.avg,

                dailyAvarageValueOfCurrentMonth: currentMonthData.dailyAverage
            };

            res.status(200).send(presentableData);
        })
    });

    workflow.emit(consts.workflow.fetchParameters);
}


function fetchFromAPI(dataParams, callback) {
    // arrange the data fetching parameters
    var parameters = `begin_date=${dataParams.startDate}&` +
        `end_date=${dataParams.endDate}&` +
        `station=${dataParams.station}&` +
        `product=${dataParams.product}&` +
        `units=english&time_zone=gmt&application=ports_screen&format=json&interval=h&datum=MLLW`;

    // fetch the current month data
    rp({ uri: consts.API + parameters.trim(), method: 'GET' })
        .then(function(body) {
            body = JSON.parse(body);
            if (body.error) {
                return callback(body.error.message);
            }
            var data = body.data;
            // grouping the data with date
            var hash = data.reduce((p, c) => (p[c.t.substr(0, 10)] ? p[c.t.substr(0, 10)].push(c) : p[c.t.substr(0, 10)] = [c], p), {});
            var newData = Object.keys(hash).map(
                k => ({
                    date: k,
                    data: hash[k],
                    max: hash[k].reduce((p, c) => (Number(p.v) > Number(c.v)) ? p : c),
                    min: hash[k].reduce((p, c) => (Number(p.v) < Number(c.v)) ? p : c),
                    avg: (hash[k].reduce((sum, val) => (sum + Number(val.v)), 0) / hash[k].length).toFixed(2)
                })
            );

            var dataPresent = {
                dailyAverage: Object.keys(newData).map(
                    i => ({
                        date: newData[i].date,
                        avg: newData[i].avg
                    })
                ),
                max: data.reduce((p, c) => (Number(p.v) > Number(c.v)) ? p : c),
                min: data.reduce((p, c) => (Number(p.v) < Number(c.v)) ? p : c),
                avg: (data.reduce((sum, val) => (sum + Number(val.v)), 0) / data.length).toFixed(2),
                metadata: body.metadata
            };

            callback(null, dataPresent);

        }).catch(function(err, body) {
            callback(err);
        });
}