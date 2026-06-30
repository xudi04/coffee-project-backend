'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/orders',
      // 'order.create' yerine tam adresini yazarak Strapi'nin çekirdeğini bypass ediyoruz:
      handler: 'api::order.order.create', 
      config: {
        auth: false,
      },
    },
  ],
};