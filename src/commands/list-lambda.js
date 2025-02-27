const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const humanize = require("humanize");
const moment = require("moment");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");
const {regions} = require("../lib/lambda");

const ONE_HOUR_IN_SECONDS = 60 * 60;

class ListLambdaCommand extends Command {
	async run() {
		const {flags} = this.parse(ListLambdaCommand);
		const {inactive, region, profile} = flags;
    
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}
    
		checkVersion();
    
		if (region) {
			show(await getFunctionsInRegion(region, inactive));
		} else {
			show(await getFunctionsinAllRegions(inactive));
		}
	}
}

ListLambdaCommand.description = "List Lambda functions in ALL regions";
ListLambdaCommand.flags = {
	inactive: flags.boolean({
		char: "i",
		description: "only include functions that are inactive for 30 days",
		required: false,
		default: false
	}),
	region: flags.string({
		char: "r",
		description: "only include functions in an AWS region, e.g. us-east-1",
		required: false
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	})
};

const getLastInvocationDates = async (region, functionNames) => {
	const CloudWatch = new AWS.CloudWatch({ region });
  
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);
  
	const queries = functionNames.map(functionName => ({
		Id: functionName.toLowerCase().replace(/\W/g, ""),
		Label: functionName,
		MetricStat: {
			Metric: {
				Dimensions: [{ Name: "FunctionName", Value: functionName }],
				MetricName: "Invocations",
				Namespace: "AWS/Lambda"
			},
			Period: ONE_HOUR_IN_SECONDS,
			Stat: "Sum"
		},
		ReturnData: true
	}));
  
	const resp = await CloudWatch.getMetricData({
		StartTime: thirtyDaysAgo,
		EndTime: new Date(),
		ScanBy: "TimestampDescending",
		MetricDataQueries: queries
	}).promise();
  
	const lastInvocationDates = functionNames.map(functionName => {
		const metricData = resp.MetricDataResults.find(r => r.Label === functionName);
		if (_.isEmpty(metricData.Timestamps)) {
			return [functionName, "inactive for 30 days"];
		}

		const lastInvokedOn = _.max(metricData.Timestamps);
		return [functionName, moment(lastInvokedOn).fromNow()];
	});	
  
	return _.fromPairs(lastInvocationDates);
};

const getFunctionsInRegion = async (region, inactive) => {
	const Lambda = new AWS.Lambda({ region });

	const loop = async (acc = [], marker) => {
		const resp = await Lambda.listFunctions({
			Marker: marker,
			MaxItems: 50
		}).promise();
    
		if (_.isEmpty(resp.Functions)) {
			return acc;
		}
    
		const functionNames = resp.Functions.map(x => x.FunctionName);    
		const lastInvokedOn = await getLastInvocationDates(region, functionNames);

		for (const func of resp.Functions) {
			const functionDetails = {
				region: region,
				functionName: func.FunctionName,
				runtime: func.Runtime,
				memory: func.MemorySize,
				codeSize: func.CodeSize,
				lastModified: func.LastModified,
				lastUsed: lastInvokedOn[func.FunctionName]
			};
      
			if (!inactive) {
				acc.push(functionDetails);
			} else if (inactive && functionDetails.lastUsed.startsWith("inactive")) {
				acc.push(functionDetails);
			}
		}

		if (resp.NextMarker) {
			return await loop(acc, resp.NextMarker);
		} else {
			return acc;
		}
	};

	return loop();
};

const getFunctionsinAllRegions = async (inactive) => {
	const promises = regions.map(region => getFunctionsInRegion(region, inactive));
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const show = (functions) => {
	const table = new Table({
		head: ["region", "name", "runtime", "memory", "code size", "last modified", "last used"]
	});
	functions.forEach(x => {
		table.push([ 
			x.region, 
			humanize.truncatechars(x.functionName, 50),
			x.runtime, 
			x.memory,
			humanize.filesize(x.codeSize),
			moment(new Date(x.lastModified)).fromNow(),
			x.lastUsed
		]);
	});
  
	console.log(table.toString());
};

module.exports = ListLambdaCommand;
