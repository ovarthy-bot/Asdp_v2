# ASDP v22.0

Uçak Bakım İş Planlama Sistemi — web sürümü.

## Çalıştırma

- `index.html`, `script.js` ve `style.css` dosyalarını aynı klasörde tutun.
- `index.html` dosyasını tarayıcıda açın veya mevcut statik hosting alanınıza yükleyin.
- İşler, teknisyenler ve ayarlar tarayıcı `localStorage` alanında saklanır. Tarayıcı verileri silinirse kayıtlar da silinebilir.

## Dağıtım algoritması

- **Ekipler (gruplar):** Teknisyenler birden fazla ekibe bölünebilir; her teknisyen yalnızca bir ekipte yer alır ve **aynı ekipteki herkes aynı işi aynı saat aralığında yapar**. Ekip büyüklükleri işlerin süresine göre seçilir (ör. 7 kişi: 7 | 4+3 | 3+3+1 …): bir işin birimi (15 dk × kişi) ekip büyüklüğüne tam bölünüyorsa ekipte kimse farklı bir aralıkta çalışmaz. Tam bölünmeyen artık yalnızca ekibin bir kısmına, ayrı bir satırda verilir.
- **Az parçalı zaman:** Her ekip için birkaç yerleşim biçimi (şerit, hücre hizalı) denenir ve ekip kartında en az parça + satır üreteni seçilir (Supervisor Grup'taki Teknisyen–Supervisor birebir eşleştirme bölmeleri hesaba katılır). Her iş her teknisyende mümkün olduğunca tek parça kalır.
- **Hassasiyet çubuğu** (🧠 Dağıtım Algoritması): sol uçta ekipteki herkes aynı işi aynı saat aralığında yapar, iş parçaları en aza iner ve işlerin arasına boşluk girmez; sağ uçta B1 onay aralıkları eşitlenir ve işlerin saatleri B1'e göre ayarlanır (gerekirse araya boş aralık girer). Orta konumda işlerin bitişleri doğal sıradan B1 düzenine doğru kısmen kaydırılır.
- **Senaryolar:** adam saat dağıtımı birden fazla ekip düzeniyle yapılabiliyorsa plan sonucunda senaryolar listelenir (herkesin tek ekip olduğu senaryo her zaman listededir); önerilen otomatik seçilir, istenirse kullanıcı başka bir senaryoyu seçer.
- **Tek ekip kartı:** 👷 Teknisyenlerin Programı'nda her teknisyen yalnızca bir ekipte (kartta) görünür.
- Supervisor denetimi, B1 onayı ve iş süresi sınırları her çubuk konumunda ve her senaryoda aynen geçerlidir.

## Belgeler

- `ANALIZ_RAPORU.md`: inceleme, düzeltmeler, bilinen sınırlar ve test sonuçları.
- `test_asdp.py`: Chromium/Playwright geliştirme testleri; uygulamanın çalışması için gerekli değildir.
