const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    const target = 'http://192.168.120.208:8080';

    app.use(
        '/api',
        createProxyMiddleware({
            target: target,
            changeOrigin: true,
        })
    );

    app.use(
        '/stream',
        createProxyMiddleware({
            target: target,
            changeOrigin: true,
        })
    );

    app.use(
        '/rtc',
        createProxyMiddleware({
            target: target,
            changeOrigin: true,
            ws: true
        })
    );
};
