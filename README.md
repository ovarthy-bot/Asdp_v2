# ASDP v22.0

Uçak Bakım İş Planlama Sistemi — web sürümü.

## Çalıştırma

- `index.html`, `script.js` ve `style.css` dosyalarını aynı klasörde tutun.
- `index.html` dosyasını tarayıcıda açın veya mevcut statik hosting alanınıza yükleyin.
- İşler, teknisyenler ve ayarlar tarayıcı `localStorage` alanında saklanır. Tarayıcı verileri silinirse kayıtlar da silinebilir.

## Dağıtım algoritması

- **Hassasiyet çubuğu** (🧠 Dağıtım Algoritması): sol uçta tüm teknisyenler neredeyse aynı işleri aynı saat aralıklarında yapar, B1 onayları işlerin doğal bitişine göre dağılır; sağ uçta B1 onay aralıkları eşitlenir ve diğer teknisyenlerin işleri/saatleri B1'e göre ayarlanır.
- **Senaryolar:** adam saat dağıtımı birden fazla ekip düzeniyle yapılabiliyorsa plan sonucunda senaryolar listelenir; önerilen otomatik seçilir, istenirse kullanıcı başka bir senaryoyu seçer.
- **Tek ekip kartı:** 👷 Teknisyenlerin Programı'nda her teknisyen yalnızca bir ekipte (kartta) görünür.
- Supervisor denetimi, B1 onayı ve iş süresi sınırları her çubuk konumunda ve her senaryoda aynen geçerlidir.

## Belgeler

- `ANALIZ_RAPORU.md`: inceleme, düzeltmeler, bilinen sınırlar ve test sonuçları.
- `test_asdp.py`: Chromium/Playwright geliştirme testleri; uygulamanın çalışması için gerekli değildir.
