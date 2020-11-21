const express = require("express")
//const cors = require('cors')
const bodyParser = require("body-parser")
//const cookieParser = require("cookie-parser")
//const Config = require('./config')

// init express stuff
const port = 80
/* 
var corsOptions = {
    origin: Config.CorsOrigin,
    methods: 'POST,GET',
    credentials: true,
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
 */

const k8sHandler = require("./k8sHandler")

const app = express()
app.use(bodyParser.json())
//app.use(cookieParser())
//app.use(cors(corsOptions))
//app.use(validateToken)

app.get("/clusterstate", k8sHandler.getClusterState)
app.post("/manageapps", k8sHandler.createApp)
app.delete("/manageapps", k8sHandler.deleteApp)


app.listen(port)
console.log("Server is listening on port: " + port)