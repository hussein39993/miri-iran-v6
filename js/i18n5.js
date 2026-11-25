// V5 translation additions (round trip, passenger types, sorting/filtering, refund request). Key sets must stay identical across languages (tests enforce this).
(function () {
const add = {
ar:{trip:'نوع الرحلة',tripOpts:['ذهاب فقط','ذهاب وعودة'],retDate:'تاريخ العودة',adults:'بالغون',children:'أطفال',infants:'رضّع',cabin:'الدرجة',cabinOpts:['اقتصادية','أعمال'],
err_returnDate:'اختر تاريخ عودة لا يسبق تاريخ الذهاب.',err_pax:'يجب بالغ واحد على الأقل، وعدد الرضّع لا يزيد على عدد البالغين، والمجموع (بالغون وأطفال) 9 كحد أقصى.',err_refRef:'أدخل مرجعاً تجريبياً موجوداً في حجوزاتك، مثل DEMO-BKG-0001. أنشئ حجزاً تجريبياً أولاً.',
sortBy:'ترتيب حسب',sort_price:'السعر',sort_duration:'المدة',sort_dep:'وقت الإقلاع',onlyNonstop:'بدون توقف فقط',noResults:'لا توجد نتائج مطابقة.',
paxNote:'أسعار فئات الركاب (طفل 75% ورضيع 10%) أمثلة تجريبية، وليست أسعار شركات طيران.',r_retDate:'تاريخ العودة',
refRef:'مرجع الحجز التجريبي',refReason:'سبب الطلب',refReasons:['تغيير الخطة','خطأ في البيانات','أخرى']},
fa:{trip:'نوع سفر',tripOpts:['یک‌طرفه','رفت و برگشت'],retDate:'تاریخ برگشت',adults:'بزرگسال',children:'کودک',infants:'نوزاد',cabin:'کلاس پرواز',cabinOpts:['اقتصادی','بیزینس'],
err_returnDate:'تاریخ برگشت نباید قبل از تاریخ رفت باشد.',err_pax:'حداقل یک بزرگسال لازم است، تعداد نوزادان بیشتر از بزرگسالان نباشد و مجموع بزرگسال و کودک حداکثر ۹ باشد.',err_refRef:'یک شناسه آزمایشی موجود در رزروهای خود وارد کنید، مثل DEMO-BKG-0001. ابتدا یک رزرو آزمایشی بسازید.',
sortBy:'مرتب‌سازی بر اساس',sort_price:'قیمت',sort_duration:'مدت',sort_dep:'ساعت پرواز',onlyNonstop:'فقط بدون توقف',noResults:'نتیجه‌ای یافت نشد.',
paxNote:'قیمت گروه‌های مسافر (کودک ۷۵٪ و نوزاد ۱۰٪) نمونه آزمایشی است و قیمت واقعی ایرلاین نیست.',r_retDate:'تاریخ برگشت',
refRef:'شناسه رزرو آزمایشی',refReason:'دلیل درخواست',refReasons:['تغییر برنامه','خطا در اطلاعات','سایر']},
en:{trip:'Trip type',tripOpts:['One way','Round trip'],retDate:'Return date',adults:'Adults',children:'Children',infants:'Infants',cabin:'Cabin',cabinOpts:['Economy','Business'],
err_returnDate:'Choose a return date that is not before the departure date.',err_pax:'At least one adult is required, infants cannot outnumber adults, and adults plus children can be at most 9.',err_refRef:'Enter a demo reference that exists in your bookings, such as DEMO-BKG-0001. Create a demo booking first.',
sortBy:'Sort by',sort_price:'Price',sort_duration:'Duration',sort_dep:'Departure time',onlyNonstop:'Non-stop only',noResults:'No matching results.',
paxNote:'Passenger-type prices (child 75%, infant 10%) are demo examples, not airline fares.',r_retDate:'Return date',
refRef:'Demo booking reference',refReason:'Reason',refReasons:['Change of plans','Wrong details','Other']}
};
const svcAdd = { ar:{refund:'طلب استرداد'}, fa:{refund:'درخواست بازپرداخت'}, en:{refund:'Refund request'} };
const descAdd = { ar:{refund:'طلب تجريبي لاسترداد حجز تجريبي. لا يُرجَع أي مال.'}, fa:{refund:'درخواست آزمایشی بازپرداخت برای یک رزرو آزمایشی. هیچ پولی برگردانده نمی‌شود.'}, en:{refund:'Demo refund request for a demo booking. No money is returned.'} };
const TT = window.T; for (const l of Object.keys(add)) { Object.assign(TT[l], add[l]); Object.assign(TT[l].svc, svcAdd[l]); Object.assign(TT[l].finDesc, descAdd[l]); }
})();
