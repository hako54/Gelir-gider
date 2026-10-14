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
  js/capacitor.js       Capacitor çalışma zamanı (npm run runtime ile güncellenir)
  manifest.webmanifest  PWA tanımı
  sw.js                 çevrimdışı önbellek (yalnızca tarayıcıda)
  icons/                PWA ikonları
android/, ios/          native projeler
assets/                 ikon ve açılış ekranı kaynakları
capacitor.config.json   uygulama kimliği ve eklenti ayarları
```

## iPhone'da kullanma (kurulum gerektirmez)

Web sürümü her gönderimde **https://hako54.github.io/Gelir-gider/** adresinde yayınlanır.
iPhone'da **Safari** ile aç → Paylaş düğmesi → **Ana Ekrana Ekle**. Uygulama ana ekranda kendi ikonuyla açılır, internetsiz de çalışır; veriler telefonda saklanır.
(Bildirimler bu yolda yoktur; bildirimler için App Store / TestFlight sürümü gerekir.)

## Android ve iOS uygulaması (Capacitor)

`android/` ve `ios/` klasörleri hazır native projelerdir; `www/` içindeki uygulamayı çalıştırırlar.

| Özellik | Tarayıcı | Android / iOS |
|---|---|---|
| Veri saklama | localStorage | `@capacitor/preferences` (kalıcı) + localStorage yedek kopya |
| Ödeme hatırlatmaları | — | `@capacitor/local-notifications`: son ödeme günü ve “X gün önce” bildirimleri, seçilebilir saat, gecikmiş ödeme uyarısı |
| Yedek / CSV dışa aktarma | dosya indirme | `@capacitor/filesystem` + `@capacitor/share` ile paylaş menüsü (Drive, WhatsApp, Dosyalar…) |
| Android geri tuşu | — | `@capacitor/app`: önce pencereyi kapatır, sonra Özet’e döner, en son uygulamadan çıkar |

### Test APK'sı (bilgisayar gerekmeden)

`main` dalına her gönderimde GitHub Actions bir test APK'sı derler ve şu sabit bağlantıya koyar:

**https://github.com/hako54/Gelir-gider/releases/download/apk-latest/kasa-defteri.apk**

Bağlantıyı telefonda aç, inen dosyaya dokunup kur (bilinmeyen kaynaklardan yüklemeye izin vermen gerekir).

### Bilgisayarda geliştirme

Gerekenler: Node.js 22+, Android için Android Studio (JDK 21 ile gelir), iOS için macOS + Xcode 16+.

```bash
npm install
npm run android   # web dosyalarını aktarır ve Android Studio'yu açar
npm run ios       # web dosyalarını aktarır ve Xcode'u açar (macOS)
```

`www/` içinde değişiklik yaptıktan sonra `npm run sync` çalıştır. İkon ya da açılış ekranını değiştirmek için `assets/` içindeki PNG'leri güncelleyip `npm run assets` çalıştır.

### Mağazaya çıkış kontrol listesi

1. **Uygulama kimliği:** `capacitor.config.json` içindeki `com.kasadefteri.app` değerini kendi alan adınla değiştir (ör. `com.seninsirketin.kasadefteri`). Mağazaya çıktıktan sonra değiştirilemez. Değiştirdikten sonra `android/` ve `ios/` klasörlerini silip `npx cap add android && npx cap add ios && npm run assets` ile yeniden oluştur.
2. **Google Play:** Play Console geliştirici hesabı (tek seferlik 25 $). Android Studio → *Build → Generate Signed App Bundle* ile imzalı `.aab` üret; imza anahtarını güvenli sakla.
3. **App Store:** Apple Developer Program (yıllık 99 $), Xcode'da *Signing & Capabilities* altında takımını seç, *Product → Archive* ile yükle.
4. **Gizlilik politikası:** Mağazalar ister. Veriler cihazda kaldığı ve hiçbir sunucuya gitmediği için kısa bir metin yeterli; Play'in “Veri güvenliği” formunda “veri toplanmıyor” seçilebilir.
5. **Gelir modeli:** Ücretli uygulama ya da ücretsiz + uygulama içi satın alma (ör. bulut yedekleme, çoklu cihaz eşitleme, PDF rapor, sınırsız plan). Uygulama içi satın alma için RevenueCat (`@revenuecat/purchases-capacitor`) kolay bir seçenek.
