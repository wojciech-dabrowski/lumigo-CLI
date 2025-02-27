const childProcess = require("child_process");
const semver = require("semver");

const checkVersion = () => {
	const packageJson = require("../../package.json");
	const version = packageJson.version;
	try {
		const npmVersion = childProcess.execSync("npm show lumigo-cli version").toString().trim();
  
		if (semver.gt(npmVersion, version)) {
			console.log(`
  ===============================================================
       v${npmVersion} of this CLI is now available on NPM.
         Please run "npm i -g lumigo-cli" to update :-)
  ===============================================================
      `);
		}
	// eslint-disable-next-line no-empty
	} catch (err) {
	}
};

module.exports = {
	checkVersion
};
