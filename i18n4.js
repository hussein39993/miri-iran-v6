// V4 additions (taxi map flow, customer services, home). Keys must stay identical across languages (tests enforce this).
(function () {
const add = {
ar:{customer:'خدماتي',destTitle:'وجهات مقترحة (أمثلة)',o3t:'اطلب سيارة على خريطة حقيقية',o3d:'واجهة تجريبية لطلب سيارة أجرة. لا طلبات حقيقية.',
nfTitle:'الإشعارات',nfItems:['تم إنشاء طلب حجز تجريبي (مثال)','تم تحديث حالة رحلة تجريبية (مثال)','تنبيه أمني تجريبي (مثال)'],nfNote:'إشعارات تجريبية فقط. لا يتم إرسال أي رسالة SMS أو بريد إلكتروني.',
tx_optA:'اطلب داخل ميرى ايران (تجريبي)',tx_optAd:'اختر الانطلاق والوجهة والسيارة على الخريطة. طلب تجريبي فقط.',
tx_pickupTitle:'حدّد نقطة الانطلاق',tx_destTitle:'حدّد الوجهة',tx_search:'ابحث عن عنوان أو جامعة أو فندق أو مستشفى أو مطار',tx_searchBtn:'بحث',tx_locate:'استخدم موقعي',tx_myLoc:'موقعي الحالي',tx_locDenied:'تعذّر تحديد الموقع. لم يُمنح الإذن أو الخدمة غير متاحة.',
tx_noResults:'لا توجد نتائج. جرّب كلمات أخرى أو حرّك الخريطة.',tx_searching:'جارٍ البحث...',tx_netFail:'خدمة البحث غير متاحة الآن. حرّك الخريطة أو اختر من الأماكن أدناه.',tx_popular:'أماكن شائعة (إحداثيات تقريبية)',tx_recent:'وجهات سابقة',
tx_moveMap:'حرّك الخريطة ليكون الدبوس على المكان الدقيق.',tx_confirmP:'تأكيد نقطة الانطلاق',tx_confirmD:'تأكيد الوجهة',tx_outside:'الموقع خارج المنطقة المدعومة (إيران).',tx_mapFail:'تعذّر تحميل الخريطة التفاعلية. استخدم قائمة الأماكن.',
tx_swap:'تبديل',tx_edit:'تعديل',tx_routeLoading:'جارٍ حساب المسار...',tx_roadEst:'مسار طرق تقديري (OSRM). ليس تقدير Snapp.',tx_lineEst:'تقريب بخط مستقيم لأن خدمة المسارات غير متاحة.',
tx_fareDemo:'سعر مثال تجريبي، وليس عرض سعر من Snapp.',tx_arrival:'وقت وصول السائق: غير متاح (يحتاج مزوّداً رسمياً)',v_eco:'اقتصادي',v_pre:'مميز',vd_eco:'سيارة عادية بسعر مناسب',vd_pre:'سيارة أكثر راحة',
tx_toPay:'متابعة',tx_note:'ملاحظة للسائق (اختياري)',tx_request:'اطلب سيارة (تجريبي)',tx_stages:['تم إنشاء الطلب (تجريبي)','جارٍ البحث عن سائق (تجريبي)','تم تعيين سائق (محاكاة)','السائق قادم (محاكاة)','بدأت الرحلة (محاكاة)','اكتملت الرحلة (محاكاة)','أُلغيت الرحلة'],
tx_receipt:'إيصال رقمي (تجريبي، ليس إيصالاً حقيقياً)',tx_plannedLbl:'ميزات مخطط لها (تحتاج دعم المزوّد)',tx_planned:['رحلة مجدولة','محطات إضافية','مشاركة الرحلة'],tx_mapNote:'خرائط OpenStreetMap وخدمات البحث والمسارات العامة للاختبار فقط، وليست لحمل إنتاجي.',tx_coords:'الإحداثيات',
ppl:['برج آزادي (طهران)','حرم الإمام الرضا (مشهد)','مطار مشهد','وسط سبزوار','حرم السيدة معصومة (قم)','ميدان نقش جهان (أصفهان)','بازار وكيل (شيراز)']},
fa:{customer:'خدمات من',destTitle:'مقصدهای پیشنهادی (نمونه)',o3t:'خودرو را روی نقشه واقعی درخواست کنید',o3d:'نمایش آزمایشی درخواست تاکسی. درخواست واقعی ثبت نمی‌شود.',
nfTitle:'اعلان‌ها',nfItems:['درخواست رزرو آزمایشی ایجاد شد (نمونه)','وضعیت یک سفر آزمایشی تغییر کرد (نمونه)','هشدار امنیتی آزمایشی (نمونه)'],nfNote:'اعلان‌های آزمایشی. هیچ پیامک یا ایمیلی ارسال نمی‌شود.',
tx_optA:'درخواست داخل میری ایران (آزمایشی)',tx_optAd:'مبدأ، مقصد و خودرو را روی نقشه انتخاب کنید. فقط درخواست آزمایشی.',
tx_pickupTitle:'مبدأ را مشخص کنید',tx_destTitle:'مقصد را مشخص کنید',tx_search:'جست‌وجوی آدرس، دانشگاه، هتل، بیمارستان یا فرودگاه',tx_searchBtn:'جست‌وجو',tx_locate:'استفاده از موقعیت من',tx_myLoc:'موقعیت فعلی من',tx_locDenied:'موقعیت مکانی در دسترس نیست. اجازه داده نشده یا سرویس فعال نیست.',
tx_noResults:'نتیجه‌ای نبود. عبارت دیگری امتحان کنید یا نقشه را جابه‌جا کنید.',tx_searching:'در حال جست‌وجو...',tx_netFail:'سرویس جست‌وجو فعلاً در دسترس نیست. نقشه را جابه‌جا کنید یا از مکان‌های زیر انتخاب کنید.',tx_popular:'مکان‌های پرکاربرد (مختصات تقریبی)',tx_recent:'مقصدهای اخیر',
tx_moveMap:'نقشه را جابه‌جا کنید تا پین روی نقطه دقیق قرار گیرد.',tx_confirmP:'تأیید مبدأ',tx_confirmD:'تأیید مقصد',tx_outside:'این نقطه خارج از محدوده پشتیبانی‌شده (ایران) است.',tx_mapFail:'نقشه تعاملی بارگذاری نشد. از فهرست مکان‌ها استفاده کنید.',
tx_swap:'جابه‌جایی',tx_edit:'ویرایش',tx_routeLoading:'در حال محاسبه مسیر...',tx_roadEst:'برآورد مسیر جاده‌ای (OSRM). برآورد اسنپ نیست.',tx_lineEst:'تقریب خط مستقیم، چون سرویس مسیریابی در دسترس نیست.',
tx_fareDemo:'قیمت نمونه آزمایشی؛ قیمت‌گذاری اسنپ نیست.',tx_arrival:'زمان رسیدن راننده: در دسترس نیست (نیازمند ارائه‌دهنده رسمی)',v_eco:'اقتصادی',v_pre:'ویژه',vd_eco:'خودروی معمولی با قیمت مناسب',vd_pre:'خودروی راحت‌تر',
tx_toPay:'ادامه',tx_note:'یادداشت برای راننده (اختیاری)',tx_request:'درخواست خودرو (آزمایشی)',tx_stages:['درخواست ایجاد شد (آزمایشی)','در حال جست‌وجوی راننده (آزمایشی)','راننده تعیین شد (شبیه‌سازی)','راننده در حال آمدن است (شبیه‌سازی)','سفر شروع شد (شبیه‌سازی)','سفر تمام شد (شبیه‌سازی)','سفر لغو شد'],
tx_receipt:'رسید دیجیتال (آزمایشی؛ رسید واقعی نیست)',tx_plannedLbl:'قابلیت‌های برنامه‌ریزی‌شده (نیازمند پشتیبانی ارائه‌دهنده)',tx_planned:['سفر زمان‌بندی‌شده','توقف‌های بیشتر','اشتراک سفر'],tx_mapNote:'نقشه OpenStreetMap و سرویس‌های عمومی جست‌وجو و مسیریابی فقط برای آزمایش‌اند و برای بار تولیدی مناسب نیستند.',tx_coords:'مختصات',
ppl:['برج آزادی (تهران)','حرم امام رضا (مشهد)','فرودگاه مشهد','مرکز سبزوار','حرم حضرت معصومه (قم)','میدان نقش جهان (اصفهان)','بازار وکیل (شیراز)']},
en:{customer:'My services',destTitle:'Suggested destinations (samples)',o3t:'Request a car on a real map',o3d:'Demo taxi request screen. No real orders are created.',
nfTitle:'Notifications',nfItems:['Demo booking request created (sample)','Demo ride status updated (sample)','Demo security alert (sample)'],nfNote:'Demo notifications only. No SMS or email is sent.',
tx_optA:'Book inside Miri Iran (demo)',tx_optAd:'Pick pickup, destination and car on the map. Demo request only.',
tx_pickupTitle:'Set pickup point',tx_destTitle:'Set destination',tx_search:'Search an address, university, hotel, hospital or airport',tx_searchBtn:'Search',tx_locate:'Use my location',tx_myLoc:'My current location',tx_locDenied:'Could not get your location. Permission denied or service unavailable.',
tx_noResults:'No results. Try other words or move the map.',tx_searching:'Searching...',tx_netFail:'Search is unavailable right now. Move the map or pick a place below.',tx_popular:'Popular places (approximate coordinates)',tx_recent:'Recent destinations',
tx_moveMap:'Move the map so the pin sits on the exact spot.',tx_confirmP:'Confirm pickup',tx_confirmD:'Confirm destination',tx_outside:'This point is outside the supported area (Iran).',tx_mapFail:'The interactive map could not load. Use the places list instead.',
tx_swap:'Swap',tx_edit:'Edit',tx_routeLoading:'Calculating route...',tx_roadEst:'Road route estimate (OSRM). Not a Snapp estimate.',tx_lineEst:'Straight-line approximation because routing is unavailable.',
tx_fareDemo:'Example demo fare, not a Snapp quote.',tx_arrival:'Driver arrival time: unavailable (needs an official provider)',v_eco:'Economy',v_pre:'Premium',vd_eco:'Standard car at a lower price',vd_pre:'A more comfortable car',
tx_toPay:'Continue',tx_note:'Note for the driver (optional)',tx_request:'Request taxi (demo)',tx_stages:['Request created (demo)','Searching for a driver (demo)','Driver assigned (simulated)','Driver arriving (simulated)','Ride started (simulated)','Ride completed (simulated)','Ride cancelled'],
tx_receipt:'Digital receipt (demo, not a real receipt)',tx_plannedLbl:'Planned features (need provider support)',tx_planned:['Scheduled ride','Extra stops','Ride sharing'],tx_mapNote:'OpenStreetMap tiles and the public search and routing servers are for testing only, not production load.',tx_coords:'Coordinates',
ppl:['Azadi Tower (Tehran)','Imam Reza Shrine (Mashhad)','Mashhad Airport','Sabzevar city centre','Fatima Masumeh Shrine (Qom)','Naqsh-e Jahan Square (Isfahan)','Vakil Bazaar (Shiraz)']}
};
const svcAdd = { ar:{rides:'رحلات التاكسي',transactions:'معاملاتي',notifications:'الإشعارات',help:'مركز المساعدة'}, fa:{rides:'سفرهای تاکسی',transactions:'تراکنش‌های من',notifications:'اعلان‌ها',help:'مرکز راهنما'}, en:{rides:'My rides',transactions:'My transactions',notifications:'Notifications',help:'Help center'} };
const TT = window.T; for (const l of Object.keys(add)) { Object.assign(TT[l], add[l]); Object.assign(TT[l].svc, svcAdd[l]); }
})();
