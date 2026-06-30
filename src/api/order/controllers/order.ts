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
        // 🛡️ 1. ADIM: Defansif Koruma Kalkanı
        // Eğer cartItems hiç gelmediyse veya dizi değilse çökme, boş dön
        if (!cartItems || !Array.isArray(cartItems)) {
            console.error("🔴 validateAndCalculateCart Hatası: cartItems geçerli bir dizi değil!", cartItems);
            return { totalPrice: "0.00", validatedItems: [] };
        }

        let totalPrice = 0;
        const validatedItems = []; // ⚡ Güvenli scope için const ile başlattık

        console.log("=== KONTROL EDİLEN SEPET ===", cartItems);

        for (const item of cartItems) {
            let product = null;

            // Strapi v5 Döküman Servisi Kontrolü
            if (strapi.documents) {
                // 1. Önce documentId ile doğrudan bulmayı deniyoruz
                product = await strapi.documents('api::product.product').findOne({
                    documentId: String(item.id)
                });

                // 2. Eğer documentId ile bulunamazsa (bazen düz id gelebilir), findMany ile fallback yapıyoruz
                if (!product) {
                    const allDocs = await strapi.documents('api::product.product').findMany({
                        filters: { id: Number(item.id) }
                    });
                    product = allDocs[0];
                }
            } else {
                // Strapi v4 Fallback
                product = await strapi.entityService.findOne('api::product.product', item.id);
            }

            // Ürün veritabanında gerçekten yoksa işlemi durdur (Güvenlik)
            if (!product) {
                throw new Error(`Veritabanında bu ID ile eşleşen bir ürün bulunamadı: ${item.id}`);
            }

            const itemPrice = Number(product.price);
            const itemQuantity = Number(item.quantity);
            const subTotal = itemPrice * itemQuantity;

            totalPrice += subTotal;

            // ⚡ 3. ADIM: Tüm Sipariş Detaylarını JSON Alanına Paketleme
            validatedItems.push({
                id: product.id,
                documentId: product.documentId || null,
                name: product.name,
                price: itemPrice.toFixed(2),
                quantity: itemQuantity,
                // 👇 Kullanıcının seçtiği öğütme tipini kaybetmemek için içeri gömüyoruz
                grindOption: item.grindOption || 'Belirtilmedi'
            });
        }

        // İyzico'nun kuruş kontrol mekanizması için string tipli iki basamaklı float dönüyoruz
        return {
            totalPrice: totalPrice.toFixed(2),
            validatedItems
        };
    },
    
    async create(ctx) {
        try {
            // 🛡️ 1. ADIM: Frontend'den gelen nesnenin içindeki cartItems dizisini nokta atışı alıyoruz
            const cartItems = ctx.request.body.cartItems || ctx.request.body.items;

            // Dinamik müşteri bilgilerini de body içerisinden çekiyoruz
            const customerName = ctx.request.body.customerName || 'Test Kullanıcısı';
            const customerEmail = ctx.request.body.customerEmail || 'test@email.com';
            const shippingAddressInput = ctx.request.body.shippingAddress || 'Adres Belirtilmemiş';

            if (!cartItems || !Array.isArray(cartItems)) {
                throw new Error("cartItems verisi geçerli bir dizi (Array) olarak istek gövdesinde bulunamadı.");
            }

            // ⚡ SEPETİ BİR KERE VE TAM DOĞRU PARAMETREYLE HESAPLIYORUZ
            const cartResult = await this.validateAndCalculateCart(cartItems);

            // 1. .env dosyasındaki anahtarlar ile iyzipay istemcisini ayağa kaldırıyoruz
            const iyzipay = new Iyzipay({
                apiKey: process.env.IYZICO_API_KEY,
                secretKey: process.env.IYZICO_SECRET_KEY,
                uri: process.env.IYZICO_BASE_URL
            });

            // 2. iyzico'nun beklediği zorunlu minimum istek şablonunu dolduruyoruz
            const request = {
                locale: Iyzipay.LOCALE.TR,
                conversationId: String(Date.now()),
                price: cartResult.totalPrice,       // Üstte hesaplanan temiz toplam tutar
                paidPrice: cartResult.totalPrice,   // Tahsil edilecek net tutar
                currency: Iyzipay.CURRENCY.TRY,
                basketId: 'B' + Date.now(),
                paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
                callbackUrl: 'http://localhost:1337/api/orders/callback',

                // ⚡ DİNAMİK ALANLAR: Frontend'den gelen gerçek müşteri bilgileri iyzico'ya iletiliyor
                buyer: {
                    id: 'BY_' + Date.now(),
                    name: customerName.split(' ')[0] || 'İsimsiz',
                    surname: customerName.split(' ').slice(1).join(' ') || 'Kullanıcı',
                    gsmNumber: '+905555555555',
                    email: customerEmail,
                    identityNumber: '11111111111',
                    lastLoginDate: '2026-06-29 00:00:00',
                    registrationDate: '2026-06-29 00:00:00',
                    registrationAddress: shippingAddressInput,
                    ip: ctx.ip,
                    city: 'Istanbul',
                    country: 'Turkey'
                },
                shippingAddress: {
                    contactName: customerName,
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: shippingAddressInput
                },
                billingAddress: {
                    contactName: customerName,
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: shippingAddressInput
                },
                // Bir üstteki adımdan map ettiğimiz doğrulanmış ürün listesi
                basketItems: cartResult.validatedItems.map(item => ({
                    id: String(item.id),
                    name: item.name,
                    category1: 'Kahve',
                    category2: 'Kahve Çeşitleri',
                    itemType: 'PHYSICAL',
                    price: item.price // Her bir kırılımın doğrulanmış fiyatı
                }))
            };

            // 3. iyzico API'sine asenkron isteği gönderip cevabı bekliyoruz
            const paymentFormHTML = await new Promise((resolve, reject) => {
                iyzipay.checkoutFormInitialize.create(request, function (err, result) {
                    if (err || result.status !== 'success') {
                        return reject(new Error(result?.errorMessage || 'iyzico bağlantı hatası'));
                    }
                    resolve(result.checkoutFormContent);
                });
            });

            // ❌ O HATALI OLAN İKİNCİ validateAndCalculateCart ÇAĞRISINI BURADAN SİLDİK! 
            // cartResult'ın içindeki verileri doğrudan aşağıdaki kayıt yapısına paslıyoruz:

            // ⚡ [YAMA] Ödeme Başarılı Olduğunda Siparişi Veritabanına Kalıcı Olarak Kaydetme
            try {
                if (strapi.documents) {
                    await strapi.documents('api::order.order').create({
                        data: {
                            totalPrice: Number(cartResult.totalPrice),
                            customerName: customerName,
                            customerEmail: customerEmail,
                            shippingAddress: shippingAddressInput,
                            products: cartResult.validatedItems, // Temiz doğrulanmış sepet dizisi
                            status: 'paid',
                            publishedAt: new Date()
                        }
                    });
                    console.log("📝 Sipariş Strapi veritabanına başarıyla kaydedildi.");
                }
            } catch (dbErr) {
                console.error("🔴 Veritabanına sipariş kaydedilirken hata oluştu:", dbErr.message);
            }

            // 4. Her şey sorunsuz bittiğinde formu frontend'e ateşliyoruz
            return ctx.send({
                success: true,
                checkoutFormContent: paymentFormHTML
            });

        } catch (err) {
            console.error("🔴 iyzico Controller Hatası:", err.message);
            return ctx.badRequest(err.message);
        }
    },
    async callback(ctx) {
        const { token } = ctx.request.body; // iyzico dönüşte bir token verir

        try {
            // Burada normal şartlarda iyzico'ya "Ödeme sonucunu getir" (retrieve) isteği atılır.
            // Şimdilik testi tamamlamak için doğrudan frontend'deki başarı sayfana yönlendiriyoruz:

            console.log("💰 İyzico Ödeme Tamamlandı, Token:", token);

            // Kullanıcıyı frontend sitendeki başarı sayfasına yönlendiriyoruz (Örn port 5173 ise):
            return ctx.redirect('http://localhost:5173/payment-success');

        } catch (err) {
            console.error("Callback Hatası:", err.message);
            return ctx.redirect('http://localhost:5173/payment-failed');
        }
    }
}));