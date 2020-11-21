const k8s = require('@kubernetes/client-node');

// init k8s api
const kc = new k8s.KubeConfig();

// If env variable set, we read kubeconfig from ~/.kube/config else we read from default place when this script runs in a pod in a cluster
if(process.env.KUBECONFIG_INCLUSTER === 'true') kc.loadFromCluster();
else kc.loadFromDefault();

const k8sApiCore = kc.makeApiClient(k8s.CoreV1Api);
const k8sApps = kc.makeApiClient(k8s.AppsV1Api);

function getTimestamp(){
    let date_ob = new Date();

    // current date
    // adjust 0 before single digit date
    let date = ("0" + date_ob.getDate()).slice(-2);

    // current month
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);

    // current year
    let year = date_ob.getFullYear();

    // current hours
    let hours = date_ob.getHours();

    // current minutes
    let minutes = date_ob.getMinutes();

    // current seconds
    let seconds = date_ob.getSeconds();

    // prints date & time in YYYY-MM-DD HH:MM:SS format
    return (year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds);
}

module.exports = {

    getClusterState: async (req, res) => {
        let clusterState = { namespaces: [] }

        try {
            await k8sApiCore.listNamespace().then((res) => {
                let namespaces = res.body.items

                namespaces.forEach((namespace) => {
                    let appManagerAnnotation = namespace.metadata.annotations['app-manager.brth.hu/app']
                    let status = namespace.status.phase
                    if(appManagerAnnotation != undefined && appManagerAnnotation === 'true' && status === 'Active'){
                        clusterState.namespaces.push({ 'name': namespace.metadata.name })
                    }
                })

            });

            for(index=0;index<clusterState.namespaces.length;index++){
                let namespace = clusterState.namespaces[index]

                // save deployments
                await k8sApps.listNamespacedDeployment(namespace.name).then((res) => {
                    let deploymentNames = []
                    let deployments = res.body.items
                    deployments.forEach((deployment) => {
                        let deploymentSchema = {
                            'name': deployment.metadata.name,
                            'pods': []
                        }
                        deploymentNames.push(deploymentSchema)
                    })
                    clusterState.namespaces[index].deployments = deploymentNames
                });

                // get replicasets
                let replicaSetNames = []
                await k8sApps.listNamespacedReplicaSet(namespace.name).then((res) => {
                    let replicaSets = res.body.items
                    replicaSets.forEach((replicaSet) => {
                        let replicaSetSchema = {
                            'name': replicaSet.metadata.name,
                            'deployment': replicaSet.metadata.ownerReferences[0].name
                        }
                        replicaSetNames.push(replicaSetSchema)
                    })
                    
                });

                // get pods
                let podNames = []
                await k8sApiCore.listNamespacedPod(namespace.name).then((res) => {
                    let pods = res.body.items
                    pods.forEach((pod) => {
                        let podSchema = {
                            'name': pod.metadata.name,
                            'replicaSet': pod.metadata.ownerReferences[0].name,
                            'status': pod.status.phase
                        }
                        podNames.push(podSchema)
                    })
                });

                // connect pod to deployments by replica sets
                podNames.forEach((pod) => {
                    let deploymentName = replicaSetNames.find(x => x.name === pod.replicaSet).deployment
                    let deployment = namespace.deployments.find(x => x.name === deploymentName)
                    deployment.pods.push(pod)
                })
            }

            res.json(clusterState)

        }catch(e){
            console.log(e)
            res.json({msg: 'something happened during createApp method. server timestamp: ' + getTimestamp()}).status(500)
        }

        //console.log(JSON.stringify(clusterState, null, 2))
        res.end()
    },

    createApp: async (req, res) => {
        try {
            let appName = req.body.appName

            // check if app already exists
            if(appName.length < 1) res.json({msg: 'app name field is empty'}).status(400)

            await k8sApiCore.listNamespace().then((k8sres) => {
                let namespaces = k8sres.body.items

                namespaces.forEach((namespace) => {
                    if(namespace.metadata.name === appName) res.json({msg: 'app already exists with this name (or k8s namespace)'}).status(400)
                })

            });

            // create namespace
            var namespaceSchema = {
                metadata: {
                    name: appName,
                    annotations: {
                        'app-manager.brth.hu/app': "true"
                    }
                }
            };
            await k8sApiCore.createNamespace(namespaceSchema).then((k8sres) => {
                if(k8sres.response.statusCode == 201){
                    console.log('Namespace created: ' + appName);
                }else{
                    console.log('something happened during namespace creation: ' + JSON.stringify(k8sres, null, 2))
                    res.json({msg: 'something happened during namespace creation'}).status(500)
                }
            });
            
            // create deployments
            let appDeployments = req.body.appDeployments
            if(appDeployments != undefined || appDeployments != null){
                for(index=0;index<appDeployments.length;index++){
                    deployment = appDeployments[index]
                    let deploymentSchema = {
                        metadata: {
                            name: deployment.name,
                            labels: {
                                app: deployment.name
                            }
                        },
                        spec: {
                            replicas: 1,
                            selector: {
                                matchLabels: {
                                    app: deployment.name
                                }
                            },
                            template: {
                                metadata: {
                                    labels: {
                                        app: deployment.name
                                    }
                                },
                                spec: {
                                    containers: [
                                        {
                                            name: deployment.name,
                                            image: deployment.image
                                        }
                                    ]
                                }
                            }
                        }
                    }

                    await k8sApps.createNamespacedDeployment(appName, deploymentSchema).then((k8sres) => {
                        if(k8sres.response.statusCode == 201){
                            console.log('Deployment created: ' + deployment.name)
                        }else{
                            console.log('something happened during deployment creation: ' + JSON.stringify(k8sres, null, 2))
                            res.json({msg: 'something happened during deployment creation'}).status(500)
                        }
                    });
                }
            }

            res.json({msg: 'ok'})

        }catch(e){
            console.log(e)
            res.json({msg: 'something happened during createApp method. server timestamp: ' + getTimestamp()}).status(500)
        }
        res.end()
    },

    deleteApp: async (req, res) => {
        try {
            let appName = req.body.appName

            // check if app already exists
            if(appName === undefined || appName === null ) res.json({msg: 'request does not json or does not contain appName field'}).status(400)
            if(appName.length < 1) res.json({msg: 'app name field is empty'}).status(400)

            await k8sApiCore.listNamespace().then((k8sres) => {
                let namespaces = k8sres.body.items

                for(index=0;index<namespaces.length;index++){
                    let namespace = namespaces[index]
                    let nsName = namespace.metadata.name
                    let nsAppAnnotation = namespace.metadata.annotations['app-manager.brth.hu/app']

                    if(nsAppAnnotation === undefined || nsAppAnnotation === null || nsAppAnnotation != 'true') continue

                    if(nsName === appName){
                        // nameapce exists so let's delete
                        let found = false
                        k8sApiCore.deleteNamespace(namespace.metadata.name).then((k8sres) => {
                            if(k8sres.response.statusCode == 200){
                                console.log('Namespace deleted: ' + namespace.metadata.name)
                                found = true
                                res.json({msg: 'ok'})
                            }else{
                                console.log('something happened during app deleting: ' + JSON.stringify(k8sres, null, 2))
                                res.json({msg: 'something happened during app deleting'}).status(500)
                            }
                        })
                        if(found) break
                    }
                }

                console.log('namespace not found what requested for delete: ' + appName)
                res.json({msg: 'namespace not found what requested for delete: ' + appName + ' ' + getTimestamp()}).status(404)

            });
        }catch(e){
            console.log(e)
            res.json({msg: 'something happened during createApp method. server timestamp: ' + getTimestamp()}).status(500)
        }
        res.end()
    }

}