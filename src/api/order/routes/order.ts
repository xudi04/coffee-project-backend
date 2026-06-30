'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/orders',
      handler: 'api::order.order.create', 
      config: { auth: false },
    },
    // ⚡ YENİ EKLENECEK CALLBACK ROTASI:
    {
      method: 'POST',
      path: '/orders/callback', // İyzico'da verdiğin callbackUrl ile aynı olmalı
      handler: 'api::order.order.callback', // Bir sonraki adımda controller'a ekleyeceğiz
      config: { auth: false },
    }
  ],
};