const { Logtail } = require("@logtail/node");
//dot env
require("dotenv").config();
export const logtail = new Logtail(process.env.LOGTAIL_KEY);
