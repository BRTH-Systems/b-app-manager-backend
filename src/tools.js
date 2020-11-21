const k8s = require('@kubernetes/client-node');

// init k8s api
const kc = new k8s.KubeConfig();

// If env variable set, we read kubeconfig from ~/.kube/config else we read from default place when this script runs in a pod in a cluster
if(process.env.KUBECONFIG_INCLUSTER === 'true') kc.loadFromCluster();
else kc.loadFromDefault();

module.exports = {
    
}