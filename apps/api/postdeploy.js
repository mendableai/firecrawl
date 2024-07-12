require("dotenv").config();

fetch(process.argv[2] + "/admin/" + process.env.BULL_AUTH_KEY + "/unpause", {
    method: "POST"
}).then(async x => {
    console.log(await x.text());
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
