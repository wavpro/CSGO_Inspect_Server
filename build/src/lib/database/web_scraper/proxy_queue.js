import axios from 'axios';
const proxyscrape_proxy_list_urls = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=de&ssl=all&anonymity=elite,anonymous'
];
export default class Queue {
    proxies = [];
    constructor() {
    }
    async #updateProxies() {
        const proxies = [];
        proxies.concat(await this.#getProxyScrape());
    }
    #getProxyScrape() {
        return new Promise((resolve, reject) => {
            const promises = [];
            proxyscrape_proxy_list_urls.forEach((url) => {
                promises.push(axios.request({
                    method: "GET",
                    url,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
                    }
                }));
            });
            Promise.all(promises).then((responses) => {
                let proxies = [];
                responses.forEach((response) => {
                    response.data.split('\s').forEach((line) => {
                        let url = new URL('http://' + line);
                        proxies.push({
                            protocol: url.protocol,
                            host: url.hostname,
                            port: parseInt(url.port)
                        });
                    });
                });
                resolve(proxies);
            });
        });
    }
    getNextInQueue() {
        let proxy = this.proxies.shift();
        if (!proxy) {
            return null;
        }
        this.proxies.push(proxy);
        return proxy;
    }
}