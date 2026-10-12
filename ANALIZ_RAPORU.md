# ASDP v22.0 — Algoritma Analiz ve Değişiklik Raporu

## Kapsam

İncelenen kaynak paketinde `index.html`, `script.js` ve `style.css` bulunuyordu. Analiz; görev sürelerinin hesaplanması, vardiya ve molalar, dolu saatler, sabit manuel atamalar, OPEN işler, B1 onayı, Supervisor Grup denetimi, iki dağıtım algoritması ve kullanıcı girdilerinin doğrulanmasını kapsar.

**Yeni sürüm:** v22.0  
**Doğrulama:** JavaScript sözdizimi kontrolü ve Chromium/Playwright ile 17 entegrasyon kontrolü; 17/17 başarılı.

## Düzeltilen kritik ve önemli sorunlar

### 1. Kapasite aşımında iş süresinin sessizce azaltılması

Önceki akış, toplam işçilik vardiya kapasitesini aştığında işleri orantılı olarak küçültebiliyordu. Bu, girilen işçilik tahminini değiştirdiği için planın gerçeği olduğundan farklı göstermesine neden oluyordu.

**Yeni davranış:** Girilen tahmin korunur. Kapasite açığı, toplam kapasite ve iş bazındaki eksik/atanamayan süreler sonuçlarda uyarıyla gösterilir. Kullanıcıya iş süresi değiştirilmiş gibi bir sonuç verilmez.

### 2. İş yükünü eşitlemek için işçilik süresinin yapay artırılması

Önceki dengeleme aşamaları, teknisyen yüklerini eşitlemek amacıyla bazı iş parçalarını uzatabiliyor ve yaklaşık %10'a kadar ek süre üretebiliyordu.

**Yeni davranış:** Dengeleme adına işçilik tahmini artırılmaz. Eşit pay mümkün değilse 15 dakikalık planlama aralığından veya rol/kapasite kısıtlarından doğan fark açıkça raporlanır.

### 3. Ekipli dağıtımda 15 dakika yukarı yuvarlama kaynaklı fazla işçilik

İki veya üç kişilik ekipler için kişi başı süreyi yukarı yuvarlamak, ekip toplamını kalan işçilik tahmininin üzerine çıkarabiliyordu.

**Yeni davranış:** Ekipli parça boyu 15 dakikalık birimlere aşağı yuvarlanır. Böylece algoritma yuvarlama nedeniyle işçilik tahminini aşmaz; kalan bölüm başka bir uygun aralığa sığmazsa atanamayan olarak raporlanır.

### 4. Manuel Teknisyen atamasını denetlemek için kullanılan Supervisor süresinin iki kez sayılması

Bazı grup senaryolarında manuel Teknisyen atamasına aynı işte Supervisor eklenirken bu Supervisor süresi işçilik bütçesine yeniden eklenebiliyordu.

**Yeni davranış:** Denetim için yerleştirilen Supervisor süresi de aynı işin işçilik bütçesinden düşülür; aynı dakika iki defa sayılmaz.

### 5. Vardiya, mola ve zaman dönüşüm sınırları

Eksik mola girişleri, vardiya dışındaki mola aralıkları ve çakışan yemek/çay molaları planlamayı yanıltabilirdi. Ayrıca mola sınırında başlayan/biten aralıkların iş-zamanı ile gerçek saat eşlemesi hatalı görünebiliyordu.

**Yeni davranış:**
- Başlangıç ve bitiş saati birlikte girilmelidir.
- Mola vardiya içinde olmalı ve diğer molayla çakışmamalıdır.
- Vardiya bitişi başlangıçtan sonra olmalıdır; gece yarısını aşan vardiya desteklenmez.
- Mola öncesi ve sonrası sınırlar farklı ele alınarak başlangıç/bitiş saatleri doğru eşlenir.
- Teknisyen kapasitesi ön izlemesi çakışan molaları iki kere düşmez.

### 6. Dolu saatlerin kapasite ön izlemesindeki hatalı hesabı

Mola aralığı içinde başlayan ve mola bittikten sonra devam eden bir dolu blok, net kapasite hesabında yanlış sonuç üretebiliyordu.

**Yeni davranış:** Dolu aralıklar iş-zamanına doğru çevrilir, çakışan aralıklar birleştirilir ve net kapasite bu birleşik süre üzerinden hesaplanır.

### 7. Vardiya dışındaki sabit manuel atamaların kırpılması

Vardiya dışına taşan manuel blok, kısmen kırpılarak planlanabiliyordu. Böylece kullanıcının girdiği saat ile plana giren süre farklı olabiliyordu.

**Yeni davranış:** Vardiya dışına taşan manuel blok kırpılıp kullanılmaz; sebebi sonuç uyarılarında gösterilir. Manuel bloklar başka bir manuel blokla veya dolu saatle çakışıyorsa da plana alınmaz ve uyarı gösterilir.

### 8. OPEN işlerin kalan sürelerinin kaybolması

15 dakikalık planlama aralığına sığmayan OPEN işi artıkları ve bazı tek işli OPEN senaryoları görünür bir sonuç üretmeden kalabiliyordu. Tamamen sabit atamalarla karşılanan OPEN iş için gereksiz 15 dakikalık ek parça oluşturulması da mümkündü.

**Yeni davranış:** OPEN işin kalan süresi 15 dakikadan kısaysa ya da uygun boşluğa yerleşemiyorsa sonuçlarda açıkça raporlanır. Süreyi tamamlamak için yapay işçilik eklenmez; kalan işin gerçekten yerleştirilip yerleştirilmediği görünür olur.

### 9. Geçersiz veya belirsiz kullanıcı girdileri

Plan, boş/tekrarlı teknisyen adları, boş görev adı, geçersiz süre, iş veya teknisyen listesinin boş olması gibi durumlarda yanıltıcı sonuç oluşturabilirdi. Arayüzün `step="0.25"` ayarı da plan düğmesi tarafından tek başına zorunlu tutulmuyordu.

**Yeni davranış:** Plan üretiminden önce gerekli girişler doğrulanır. Görev süreleri boş bırakılamaz; negatif veya geçersiz değerler reddedilir. Mevcut 15 dakikalık planlama ızgarasıyla tutarlılık için süreler 0,25 saat katları olmalıdır. Supervisor Grup modunda en az bir Supervisor gerekir; teknisyen isimleri benzersiz olmalıdır.

### 10. Arayüz özetlerinin birbirini ezmesi

Bazı istatistik fonksiyonlarında aynı özet alanına art arda iki kez metin atanıyordu; ilk hesapta eklenen OPEN sayısı veya ortalama yük bilgisi ikinci atamayla kayboluyordu.

**Yeni davranış:** Tek bir nihai özet metni oluşturulur ve OPEN sayısı ile kapasite bilgisi tutarlı biçimde gösterilir.

### 11. B1 onay kuralının açıklaması

Mevcut algoritma her pozitif süreli iş için en fazla 15 dakikalık B1 onay payı ayırıyor; bu, tüm görevlerin sonuna tek bir ortak 15 dakika eklemekten farklıdır. Arayüz açıklaması bu farkı yeterince net belirtmiyordu.

**Yeni davranış:** Hesaplama kuralı değiştirilmedi; arayüz metni onayın her işin bitişinde 15 dakika olarak planlandığını açıkça belirtir. Bu, kaynak kodda görülen mevcut varsayımdır; kurumun operasyonel kuralı farklıysa ayrıca kararlaştırılmalıdır.

## Korunan özellikler

- Supervisor ALL ve Supervisor Grup çalışma modları.
- B1 Öncelikli ve Teknisyen Öncelikli dağıtım seçenekleri.
- Supervisor, Kalifiyeli ve Teknisyen rolleri.
- Vardiya, yemek/çay molası, teknisyen dolu saatleri ve manuel atamalar.
- OPEN işlerin boş zamanları doldurmak için kullanılması.
- B1 zaman listesi, atama çıktıları ve planın kopyalanabilir özeti.
- Kullanıcı ayarlarının tarayıcı `localStorage` alanında saklanması.

## Bilinen sınırlar ve işletme açısından kontrol edilmesi gerekenler

1. **Algoritma bir sezgisel dağıtıcıdır; matematiksel optimizasyon garantisi vermez.** Zaman, rol ve kapasite kısıtları altında bir plan üretmeye çalışır; mümkün olmayan bölümleri uyarı/atanamayan listeye bırakabilir.
2. **Supervisor Grup modunda denetim kuralı manuel sabit atamadan önceliklidir.** Teknisyen rolündeki kişi aynı işte aynı saatlerde çalışan bir Supervisor ile kapsanmıyorsa, denetimsiz aralık plana alınmaz ve uyarı gösterilir. Yani geçersiz manuel girişin tüm süresi mutlaka planda korunmaz.
3. **Gece yarısını aşan vardiyalar desteklenmiyor.** Vardiya başlangıç ve bitişi aynı gün içinde olmalıdır.
4. **B1 onayı için iş başına 15 dakika davranışı mevcut kaynakta vardır.** Bu iş kuralı kurum prosedürüyle karşılaştırılmalıdır.
5. **Rol uygunluğu görev/lisans matrisiyle doğrulanmıyor.** Uygulama kişi rolünü ve genel gözetim kurallarını kontrol eder; belirli iş kartının hangi lisans veya yetkiyi gerektirdiğine ilişkin ayrı bir yetki tablosu kaynak pakette bulunmamaktadır.
6. **Kalıcı veri tarayıcıya özeldir.** Veriler sunucuda senkronize edilmez; başka tarayıcıya/cihaza otomatik aktarılmaz. Tarayıcı verilerini silmek uygulama ayarlarını da silebilir.
7. Sonuçlar bir planlama önerisidir. Gerçek bakım atamalarında güncel işyeri prosedürleri, yetki kapsamı, gerçek iş durumu ve operasyonel kısıtlar ayrıca doğrulanmalıdır.

## Doğrulama sonuçları

`test_asdp.py` test düzeneği uygulamayı Chromium içinde çalıştırıp 17 senaryoyu kontrol eder. Kapsam: ilk açılış, varsayılan plan, 15 dakika dışı süre doğrulaması, mola sınırlarının eşlenmesi, mola çakışması, kapasite açığının korunması, fazla manuel atama uyarısı, Supervisor Grup modu, ekipli algoritmanın işçilik üst sınırı, Supervisor denetim süresinin çift sayılmaması, vardiya dışı sabit atama, mola içinden başlayan dolu bloğun kapasite etkisi, iki OPEN senaryosu, tek işli OPEN senaryosu ve tarayıcı JavaScript hatası kontrolü.

Son koşuda **17/17 kontrol başarılı**, `node --check script.js` başarılıdır. Bu testler senaryolarla doğrulama sağlar; tüm olası teknisyen/iş/mola kombinasyonlarının matematiksel kanıtı değildir.

## Kurulum

1. ZIP paketini bir klasöre çıkarın.
2. `index.html`, `script.js` ve `style.css` aynı klasörde kalmalıdır.
3. `index.html` dosyasını tarayıcıda açın veya mevcut statik barındırma alanınıza yükleyin. Ayarlar tarayıcıya özel saklandığından aynı tarayıcı/origin üzerinden kullanın.
4. Güncellemeden önce kullandığınız sürümün ve tarayıcı verilerinizin yedeğini tutun.

`test_asdp.py` yalnızca geliştirme/doğrulama içindir; uygulamanın günlük kullanımı için Python veya Playwright gerekmez. Testi yeniden çalıştırmak için Python `playwright` paketi ve Chromium gerekir.
