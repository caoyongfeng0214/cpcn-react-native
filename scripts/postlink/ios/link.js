var yargs = require('yargs');
var argv = yargs.argv;
var key = argv._[0];

var link = require('./postlink');
link.KEY = {
    iosDeploymentKey: key
};
link().catch((err)=>{
    console.log(err instanceof Object ? (err.message ? err.message : JSON.stringify(err)) : err);
});