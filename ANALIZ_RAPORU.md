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

### 12. Kısmen atanan işin kalanının B1'in boş zamanına verilmemesi

Teknisyen kapasitesi dolunca, hiç atanmamış işler B1'e bütün olarak (B1-only) veriliyordu; ancak teknisyenlere **kısmen** atanabilmiş bir işin kalanı B1'in boş zamanı olsa bile "atanamadı" olarak bırakılıyordu. Örnek: 7 personel (5,5 sa) + B1 (5,5 sa) = 44 sa kapasiteye karşılık 45 sa talepte NRC 1'in 1,75 saati atanamıyordu; oysa B1'in 0,75 saati boştaydı (en az 1,00 saat zaten sığmaz).

**Yeni davranış:** Zorunlu işlerin kapasiteden dolayı kalan süresi, OPEN dolgudan önce şu sırayla yerleştirilmeye çalışılır: (1) teknisyenlerin boş aralıkları (Teknisyen için aynı işte Supervisor kapsamı şartıyla), (2) B1'in boş zamanı (**B1 iş desteği**). Önce işin B1 onayından önceki boşluklar, olmazsa sonrası kullanılır. Hiçbir süre eklenmez; yalnızca atanamayan süre taşınır. Ayrıca:
- B1 listesinde iş desteği, onaydan ayrı bir "B1 iş desteği" etiketiyle görünür; bitişik olsalar da onayla birleştirilmez. `AI İçin Tüm Planı Kopyala` çıktısında bu satırlara `tur` alanı eklenir.
- B1'e bütün olarak sığmayan B1-only iş artık tamamen düşmez; B1'in boş zamanına sığan kısmı yerleştirilir.
- Zorunlu iş, OPEN dolgunun önüne geçer (B1 boşluğunu önce zorunlu işin kalanı kullanır).
- Manuel atama içeren işlerde kalan süre eskiden eksik raporlanıyordu (manuel süre iki kez düşülüyordu); artık işin teknisyen hedefi (manuel atamalar dahil) esas alınır.
- Denetim kuralı aynen geçerlidir: Teknisyene yalnızca aynı işte Supervisor'ün çalıştığı aralıklar verilir; B1 iş desteği Teknisyen denetimi sayılmaz.

### 13. B1 onayının işin son çalışma saatinden önceye yerleşmesi

Birçok iş vardiya sonunda aynı anda bitince B1'in son dilimleri yetmiyor, yalnızca bir iş son dilimi alıyor; diğer işlerin onayı ise bitişlerinden önceye düşüyordu (ör. NRC 4 için B1 onayı 19:00–19:15, ama bir Supervisor aynı işte 19:45'e kadar çalışıyor). Eski sürümde rastgele senaryoların yaklaşık %22'sinde en az bir iş bu durumdaydı.

**Yeni davranış:**
- B1 onayları, en geç biten iş önce olacak şekilde yerleştirilir.
- Onayı işin bitişinden önceye düşen işin, onaydan sonraki 15 dk'lık parçaları, onaydan önceki bir boşlukla ya da başka bir işin parçasıyla yer değiştirir. Yer değiştirme toplam işçiliği ve kişi yüklerini değiştirmez, hiçbir Teknisyeni denetimsiz bırakmaz, sabit manuel atamaları ve dolu saatleri taşımaz ve başka bir işi kendi onayından sonraya itmez.
- B1'in boş dilimi tüm işlere yetmiyorsa dilimler önce en çok işçilik taşıyan işlere verilir (onaysız kalan iş teknisyenlerden de geri alındığından, en az süre kaybedilsin diye).
- Yer değiştirme ile çözülemeyen durumlar (B1'in uzun süre dolu olması, sabit manuel atama vb.) sonuç sayfasında "⚠ B1 Onayı İş Bitişinden Önce" uyarısıyla listelenir.

**Bilinen sınır:** Rastgele senaryolarda ihlal oranı yaklaşık %22'den %4–6'ya (aşırı yüklü senaryolarda %8–12) indi; sıfırlanması garanti değildir. Yer değiştirme kişi başına ortalama parça sayısını yaklaşık 0,15–0,25 artırır.

### 14. Teknisyenlerin Supervisor'lerle dağınık eşleşmesi

Grup modunda her Teknisyen dakikası aynı işte çalışan bir Supervisor ile kapsanıyordu (denetim kuralı ihlal edilmiyordu), ancak kapsama yalnızca "aynı işte, aynı anda en az bir Supervisor var" düzeyindeydi. Teknisyen bloğu ile onu denetleyen Supervisor bloğu farklı saatlerde başlayıp bitiyor (ör. Supervisor 08:00–09:15, Teknisyen 08:00–09:00) veya tek bir Teknisyen bloğu art arda birkaç Supervisor'ün parçalarıyla örtülüyordu. Kartlarda bu, `Denetim: A (…), B (…)` satırlarıyla dağınık görünüyordu. Rastgele senaryolarda B1 Öncelikli yöntemde Teknisyen bloklarının %49-59'u, Teknisyen Öncelikli yöntemde %12-25'i bu durumdaydı.

**Yeni davranış:** Grup modunda Teknisyen ile onu denetleyen Supervisor **aynı iş ve birebir aynı saat aralığında** listelenir. İki adımla sağlanır:
- **Ekip penceresi (B1 Öncelikli, `placeGroupWave`):** Blok tek kişiye değil, aynı pencerede çalışacak bir ekibe verilir. Pencerenin sahibi en az yüklü kişidir; sahibi Teknisyen ise aynı pencerede boş bir Supervisor zorunlu olarak ekibe katılır, pencerede boş olan diğer kişiler de yük sırasıyla alınır. Bütçe tüm ekibe yetmiyorsa önce pencere kısaltılır, olmazsa üye sayısı azaltılır (kalan dakikalar eşit yükte önce Teknisyen/Kalifiyeli'ye, fazladan Supervisor'e en son verilir). Dolu saati yaklaşan bir kişinin kısa müsait aralığı boşa gitmesin diye pencere, en çok kişinin katılabildiği uzunluğa çekilir. Ekip kurulamazsa eski kişi bazlı yerleştirme devreye girer; kapasite kaybı olmaz.
- **Birebir eşleştirme (`alignSupervisionPieces`, her iki algoritma):** Plan bittikten sonra her Teknisyen parçasına bir Supervisor parçası atanır (aynı aralıkta olan önce; yoksa onu tamamen kapsayan en az fazlalıklı olan; o da yoksa en uzağa uzanan Supervisor parçaları zincirlenir). Farklı sınırlara sahip bloklar yalnızca birbirini denetleyen blok kümesi içinde, birbirinin sınırlarından bölünür. Zaten birebir olan hiçbir şey bölünmez; fazladan denetleyen Supervisor'ler ve Kalifiyeli parçaları bölünmez. Çalışılan zaman, kişi yükleri, iş toplamları ve B1 onayları değişmez; yalnızca bitişik parçalar artık birleştirilmez. Kartlar, WhatsApp metni ve `AI İçin Tüm Planı Kopyala` çıktısı bu parçaları kullanır.
- Denetim kuralı aynen geçerlidir: Teknisyene yalnızca aynı işte Supervisor'ün çalıştığı aralıklar verilir. Supervisor ALL modu değişmedi.

**Ölçüm (eski ve yeni kod, rastgele senaryolar; sade, mola/dolu saat/manuel atama/OPEN içeren ve kısa vardiya/az Supervisor gibi uç senaryolar):**
- Supervisor parçasıyla birebir eşleşen Teknisyen parçası oranı: B1 Öncelikli %41-51 → **%100**, Teknisyen Öncelikli %75-88 → **%100** (her iki yöntemde 9000 senaryoda eksiksiz).
- Çökme yok; çakışma, vardiya dışı çalışma, denetimsiz Teknisyen dakikası ve (B1 Öncelikli'de) iş tahmini aşımı yok.
- B1 Öncelikli'de yerleşen toplam süre sade senaryolarda +%0,5, zengin senaryolarda +%0,9 arttı, atanamayan süre sade senaryolarda yaklaşık %7, zengin senaryolarda yaklaşık %4 azaldı; kişi yükleri arasındaki ortalama fark küçüldü (sade 38 → 18 dk). Aşırı yüklü uç senaryolarda sonuç nötr (±%0,1).
- Kullanıcının 7 kişilik NRC 1-6 senaryosunda 6 Teknisyen bloğunun 6'sı birebir (eski sürümde 4/6).
- Supervisor ALL modu 500 senaryoda eski sürümle birebir aynı çıktıyı verdi.

**Bilinen sınır / bedel:** Süre işçilik birimine (15 dk) tam bölünmediğinde bir ekip diğerinden 15 dk uzun çalışır; bu fark yukarıdaki bölmeyle ayrı bir parça olarak görünür. Dolu saat ve mola nedeniyle kısmen müsait olan kişiler de aynı etkiyi yapar. Bu nedenle toplam parça sayısı eski sürüme göre B1 Öncelikli'de sade senaryolarda yaklaşık %12-16, mola/dolu saat/manuel atama içeren senaryolarda yaklaşık %25-29, Teknisyen Öncelikli'de yaklaşık %10-18 arttı. Toplam süre ve kişi yükleri değişmez; yalnızca aynı iş birden çok satıra bölünerek gösterilir.

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

**B1 iş desteği değişikliği (madde 12):** `test_asdp.py`'ye 3 kontrol eklendi (toplam 20): kapasite israf edilmiyor (44 sa yerleşiyor, NRC 1'den yalnızca 1,00 sa atanamıyor), B1 iş desteği listede ayrı görünüyor ve B1 onayı işin son çalışma saatinden önce kalmıyor (madde 13). Bu kontrollerin eşdeğeri jsdom ile doğrulandı; Playwright/Chromium düzeneği bu değişiklik sırasında çalıştırılamadı, kullanıma almadan önce `test_asdp.py` yeniden koşturulmalıdır. Ek olarak eski ve yeni kod, rastgele üretilen senaryolarda (2–9 personel, 1–8 iş, her iki mod/algoritma, mola, dolu saat, manuel atama, OPEN iş) karşılaştırıldı (3000 senaryo): yeni kod çakışma veya denetimsiz Teknisyen çalışması üretmedi ve hiç çökmedi. Zorunlu işlerde yerleşen süre 2999 senaryoda eşit ya da daha fazlaydı; yalnızca bir aşırı yüklü senaryoda (B1'de 4 boş dilim) 15 dk daha az yerleşti. Bir senaryoda `tech_priority`'nin önceden var olan fazla atama sorunu (+15 dk), iş artık B1 kuralıyla düşmediği için görünür oldu.

**Birebir eşleşme değişikliği (madde 14):** `test_asdp.py`'ye 4 kontrol eklendi (toplam 24): 7 kişilik NRC planında ve dolu saatli planda her Teknisyen parçasının Supervisor ile birebir aynı aralıkta olması, bölme adımının bloğu doğru sınırdan bölüp birebir olana dokunmaması ve dolu saati yaklaşan Teknisyenin kısa müsait aralığının boş kalmaması. Bu değişiklik sırasında da Playwright/Chromium düzeneği çalıştırılamadı; bu nedenle mantık, uygulamanın `plan()` fonksiyonunu sahte bir DOM ile Node içinde çalıştıran bir düzenekle (9000 rastgele senaryo, her iki algoritma, sade/zengin/uç senaryolar; kural ihlali, çakışma, vardiya dışı çalışma, denetimsiz Teknisyen ve tahmin aşımı kontrolleriyle), `alignSupervisionPieces` için 2715 geçerli rastgele plan üzerinde özellik testiyle (süre/yük değişmez, bölünen parçalar çakışmaz, her Teknisyen parçasının birebir eşi vardır, zaten birebir olan plana dokunulmaz) ve gerçek tarayıcıda (uygulama arayüzünden plan oluşturma, konsol hatası yok) doğrulandı. Mevcut kontrollerin denk karşılıkları da yeni kodla geçti. Kullanıma almadan önce `test_asdp.py` yeniden koşturulmalıdır.

**Önceden var olan, bu değişiklikle ilgisiz bulgu:** Teknisyen Öncelikli yöntemde bazı senaryolarda bir işin toplamı (Teknisyenler + B1 onayı) girilen tahmini 15 dk aşabiliyor (ör. 5 kişi: 3 Kalifiyeli, 1 Supervisor, 1 Teknisyen; 5 sa ve 7 sa'lık iki iş; 08:00-16:00; 7 sa'lık iş 435 dk planlanıyor). Eski sürümde de aynı sayıda görülüyor; ayrıca ele alınmalıdır.

## Kurulum

1. ZIP paketini bir klasöre çıkarın.
2. `index.html`, `script.js` ve `style.css` aynı klasörde kalmalıdır.
3. `index.html` dosyasını tarayıcıda açın veya mevcut statik barındırma alanınıza yükleyin. Ayarlar tarayıcıya özel saklandığından aynı tarayıcı/origin üzerinden kullanın.
4. Güncellemeden önce kullandığınız sürümün ve tarayıcı verilerinizin yedeğini tutun.

`test_asdp.py` yalnızca geliştirme/doğrulama içindir; uygulamanın günlük kullanımı için Python veya Playwright gerekmez. Testi yeniden çalıştırmak için Python `playwright` paketi ve Chromium gerekir.
