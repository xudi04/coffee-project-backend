`use strict`;

/**
 * order controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const Iyzipay = require('iyzipay');


module.exports = createCoreController('api::order.order', ({ strapi }) => ({

    // BURAYA YAPIŞTIRILACAK: 1. Fiyat Doğrulama Fonksiyonu
    // iyzico Sepet Doğrulama ve Fiyat Kontrol Yaması
    async validateAndCalculateCart(cartItems) {
    let totalPrice = 0;
    const validatedItems = [];

    for (const item of cartItems) {
      // Strapi v5 için hem documentId hem de normal id'yi destekleyecek şekilde arama yapıyoruz
      let product = null;
      
      if (strapi.documents) {
        // İlk önce documentId olarak arıyoruz
        product = await strapi.documents('api::product.product').findOne({ documentId: String(item.id) });
        
        // Eğer bulamazsa normal id'ye göre arıyoruz
        if (!product) {
          const allDocs = await strapi.documents('api::product.product').find({
            filters: { id: item.id }
          });
          product = allDocs[0];
        }
      } else {
        // Strapi v4 fallback
        product = await strapi.entityService.findOne('api::product.product', item.id);
      }

      if (!product) {
        throw new Error(`Ürün bulunamadı: ID ${item.id}`);
      }

      const itemPrice = Number(product.price);
      const itemQuantity = Number(item.quantity);
      const subTotal = itemPrice * itemQuantity;

      totalPrice += subTotal;

      validatedItems.push({
        id: product.id,
        name: product.name,
        price: itemPrice.toFixed(2),
        quantity: itemQuantity
      });
    }

    return {
      totalPrice: totalPrice.toFixed(2),
      validatedItems
    };
  },

  async create(ctx) {
    // Gelen ham veriyi de loglayalım ki frontend sarmalamış mı görelim
    console.log("--> Frontend'den Gelen Payload:", JSON.stringify(ctx.request.body));
    
    // Hem sarmalanmış hem sarmalanmamış senaryoyu garantiye alıyoruz
    const cartItems = ctx.request.body.data?.cartItems || ctx.request.body.cartItems;

    try {
      if (!cartItems) {
        throw new Error("cartItems verisi istek gövdesinde bulunamadı.");
      }

      const cartResult = await this.validateAndCalculateCart(cartItems);
      
      // ... iyzico form tetikleme kodların (iyzipay.checkoutFormInitialize.create) ...
      // ...
      
    } catch (err) {
      // !!! BURASI KRİTİK: Terminale hatanın özünü basıyoruz !!!
      console.error("🔴 iyzico Controller Hatası:", err.message);
      console.error(err); // Detaylı stack trace
      
      return ctx.badRequest(err.message);
    }
  }

  // İleride yazacağımız ana sipariş oluşturma (create) metodu
//   async create(ctx) {
//         const { cartItems } = ctx.request.body;

//         try {
//             // Fonksiyonun test kullanımı (Bir sonraki adımda derinleşecek)
//             const cartResult = await this.validateAndCalculateCart(cartItems);

//             // --- iyzico Form Tetikleme Yama Kodu ---

//             // 1. .env dosyasındaki anahtarlar ile iyzipay istemcisini ayağa kaldırıyoruz
//             const iyzipay = new Iyzipay({
//                 apiKey: process.env.IYZICO_API_KEY,
//                 secretKey: process.env.IYZICO_SECRET_KEY,
//                 uri: process.env.IYZICO_BASE_URL
//             });

//             // 2. iyzico'nun beklediği zorunlu minimum istek şablonunu dolduruyoruz
//             const request = {
//                 locale: Iyzipay.LOCALE.TR,
//                 conversationId: String(Date.now()), // Benzersiz istek kimliği
//                 price: cartResult.totalPrice,       // Doğrulanan net tutar
//                 paidPrice: cartResult.totalPrice,   // Tahsil edilecek tutar (Komisyon/Kargo eklemesi yoksa aynı kalır)
//                 currency: Iyzipay.CURRENCY.TRY,
//                 basketId: 'B' + Date.now(),
//                 paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
//                 // Ödeme bittiğinde iyzico'nun kullanıcıyı yönlendireceği backend veya frontend callback URL'i
//                 callbackUrl: 'http://localhost:1337/api/orders/handle-callback',

//                 // Test kullanıcısı (Buyer) bilgileri (Frontend'den dinamik de alınabilir, şimdilik sandbox için statik)
//                 buyer: {
//                     id: 'BY789',
//                     name: 'Tarık',
//                     surname: 'Bey',
//                     gsmNumber: '+905555555555',
//                     email: 'tarik@roasters.com',
//                     identityNumber: '11111111111',
//                     lastLoginDate: '2026-06-29 00:00:00',
//                     registrationDate: '2026-06-29 00:00:00',
//                     registrationAddress: 'Karaköy, İstanbul',
//                     ip: ctx.ip,
//                     city: 'Istanbul',
//                     country: 'Turkey'
//                 },
//                 shippingAddress: {
//                     contactName: 'Tarık Bey',
//                     city: 'Istanbul',
//                     country: 'Turkey',
//                     address: 'Karaköy, İstanbul'
//                 },
//                 billingAddress: {
//                     contactName: 'Tarık Bey',
//                     city: 'Istanbul',
//                     country: 'Turkey',
//                     address: 'Karaköy, İstanbul'
//                 },
//                 // Bir önceki adımda map ettiğimiz doğrulanmış ürün listesi
//                 basketItems: cartResult.validatedItems.map(item => ({
//                     id: String(item.id),
//                     name: item.name,
//                     category: 'Coffee',
//                     itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
//                     price: item.price
//                 }))
//             };

//             // 3. iyzico API'sine asenkron isteği gönderip cevabı frontend'e paslıyoruz
//             const paymentFormHTML = await new Promise((resolve, reject) => {
//                 iyzipay.checkoutFormInitialize.create(request, function (err, result) {
//                     if (err || result.status !== 'success') {
//                         return reject(new Error(result?.errorMessage || 'iyzico bağlantı hatası'));
//                     }
//                     // Frontend'e gönderilecek şifreli form HTML snippet'ı
//                     resolve(result.paymentPageSnippet);
//                 });
//             });

//             return ctx.send({
//                 success: true,
//                 paymentForm: paymentFormHTML
//             });
//             // ctx.send({ success: true, totalPrice: cartResult.totalPrice });
//         } catch (err) {
//             return ctx.badRequest(err.message);
//         }
//     }

}));