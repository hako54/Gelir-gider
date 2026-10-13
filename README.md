# Kasa Defteri

Gelir, gider ve düzenli ödemeleri (kredi taksiti, kredi kartı, aidat, kira, elektrik, su, doğalgaz, internet…) geçmiş ve gelecek aylarıyla takip eden uygulama. Saf HTML/CSS/JS ile yazıldı; kurulum ya da sunucu gerektirmez. Veriler cihazda (localStorage) saklanır.

## Çalıştırma

`www/index.html` dosyasını tarayıcıda aç. Çevrimdışı çalışma (PWA) için bir sunucudan yayınla:

```bash
cd www && python3 -m http.server 8080   # http://localhost:8080
```

## Özellikler

- **Özet:** Günlük / haftalık / aylık / yıllık gelir, gider, fark ve birikim oranı; önceki döneme göre değişim; son 12 dönem grafiği (tablo görünümü de var); kategori dağılımı; yaklaşan ve geciken ödemeler; düzenli plana göre önümüzdeki 6 ayın tahmini.
- **Ödemeler:**
  - *Aylık liste:* ayın tüm ödemeleri, durumları (Ödendi, Gecikti, Yaklaşıyor, Bekliyor, Atlandı), tek dokunuşla ödeme, önceki aylardan kalan gecikmiş ödemeler.
  - *Yıllık tablo:* her plan için 12 ayın durumu ve tutarı; geçmiş ve gelecek yıllar arasında gezinme.
  - *Planlar:* taksit ilerlemesi, kalan taksit ve tutar, sonraki ödeme tarihi.
  - Değişken tutarlı faturalar (≈ tahmini tutar), taksit sayısı, aylık / 2-3-6 ayda bir / yıllık sıklık, talimat etiketi, dönem atlama, devam eden krediler için “geçmiş dönemler ödendi” seçeneği.
- **Kayıtlar:** günlere göre gruplanmış liste, arama ve filtreler, düzenleme / silme, CSV (Excel) dışa aktarma.
- **Ayarlar:** para birimi, açık / koyu tema, uyarı süresi, kategori yönetimi, JSON yedek alma / geri yükleme.

## Dosya yapısı

```
www/
  index.html            uygulama kabuğu
  css/styles.css        tema ve düzen (açık/koyu)
  js/app.js             tüm mantık (veri modeli, görünümler, grafikler)
  manifest.webmanifest  PWA tanımı
  sw.js                 çevrimdışı önbellek
  icons/icon.svg
```

## Android ve iOS uygulamasına dönüştürme (Capacitor)

`www/` klasörü doğrudan Capacitor'ın `webDir`'i olarak kullanılabilir:

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Kasa Defteri" com.ornek.kasadefteri --web-dir www
npx cap add android && npx cap add ios
npx cap open android   # Android Studio
npx cap open ios       # Xcode (macOS gerekir)
```

Mağazaya çıkmadan önce önerilenler:

1. **Kalıcı depolama:** `js/app.js` içindeki `store` nesnesini `@capacitor/preferences` ya da SQLite ile değiştir (iOS, WebView localStorage'ını temizleyebilir).
2. **Bildirimler:** `@capacitor/local-notifications` ile son ödeme gününden önce hatırlatma.
3. **İkonlar ve açılış ekranı:** `@capacitor/assets` ile PNG ikon setleri üret.
4. **Gelir modeli:** ücretli uygulama ya da uygulama içi satın alma (ör. bulut yedekleme, çoklu cihaz eşitleme, PDF rapor).
5. **Gizlilik politikası:** mağazalar ister; veriler cihazda kaldığı için kısa tutulabilir.
