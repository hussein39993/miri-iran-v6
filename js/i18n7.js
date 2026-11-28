// Stage 3A translations: customer accounts (keys prefixed a_). Key sets must stay identical across languages.
(function () {
const add = {
ar:{
a_title:'حسابي', a_sandbox:'حسابات تجريبية (Sandbox): لا يُرسل بريد حقيقي، وتصل روابط التفعيل واستعادة كلمة المرور إلى المسؤول في صندوق البريد التجريبي. لا توجد أموال حقيقية.',
a_login:'تسجيل الدخول', a_register:'إنشاء حساب', a_forgot:'نسيت كلمة المرور؟', a_logout:'تسجيل الخروج', a_logoutAll:'الخروج من كل الأجهزة',
a_email:'البريد الإلكتروني', a_password:'كلمة المرور', a_password2:'تأكيد كلمة المرور', a_fullName:'الاسم الكامل', a_phone:'رقم الهاتف (اختياري)', a_lang:'اللغة', a_currentPw:'كلمة المرور الحالية', a_newPw:'كلمة المرور الجديدة',
a_pwHint:'كلمة المرور 10 أحرف على الأقل، ولا تكون شائعة.', a_submitLogin:'دخول', a_submitRegister:'إنشاء الحساب', a_submitForgot:'إرسال رابط الاستعادة', a_submitReset:'حفظ كلمة المرور الجديدة', a_save:'حفظ', a_changePw:'تغيير كلمة المرور', a_resend:'إعادة إرسال رابط التفعيل',
a_regDone:'تم إنشاء الحساب. افتح رابط التفعيل المرسل إلى بريدك ثم سجّل الدخول. (في النسخة التجريبية يظهر الرابط للمسؤول.)', a_forgotDone:'إذا كان البريد مسجلاً لدينا فقد أُرسل رابط الاستعادة.', a_resendDone:'إذا كان الحساب بانتظار التفعيل فقد أُرسل رابط جديد.',
a_verifying:'جارٍ تفعيل الحساب...', a_verifyOk:'تم تفعيل حسابك بنجاح. يمكنك تسجيل الدخول الآن.', a_verifyBad:'رابط التفعيل غير صالح أو منتهٍ.', a_goLogin:'الذهاب لتسجيل الدخول',
a_resetTitle:'تعيين كلمة مرور جديدة', a_resetOk:'تم تغيير كلمة المرور. سُجّل خروجك من كل الأجهزة، فسجّل الدخول من جديد.', a_resetBad:'رابط الاستعادة غير صالح أو منتهٍ.',
a_custNo:'رقم العميل', a_status:'حالة الحساب', a_st_pending_verification:'بانتظار التفعيل', a_st_active:'نشط', a_st_restricted:'مقيّد', a_st_suspended:'موقوف', a_st_closed:'مغلق', a_verified:'البريد مفعّل', a_notVerified:'البريد غير مفعّل', a_member:'عضو منذ', a_lastLogin:'آخر دخول',
a_restrictedNote:'حسابك مقيّد حالياً: يمكنك عرض بياناتك فقط. تواصل مع الدعم الفني.', a_saved:'تم الحفظ.', a_pwChanged:'تم تغيير كلمة المرور. سُجّل خروجك من الأجهزة الأخرى.', a_loggedOutAll:'تم تسجيل الخروج من كل الأجهزة.',
a_loading:'جارٍ التحميل...', a_waking:'الخادم يستيقظ... قد يستغرق ذلك حتى دقيقة في أول مرة.',
a_e_generic:'حدث خطأ. حاول مرة أخرى.', a_e_NETWORK:'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.', a_e_TIMEOUT:'الخادم يستجيب ببطء. حاول مرة أخرى بعد قليل.',
a_e_INVALID_CREDENTIALS:'البريد الإلكتروني أو كلمة المرور غير صحيحة.', a_e_EMAIL_NOT_VERIFIED:'يجب تفعيل بريدك الإلكتروني أولاً.', a_e_ACCOUNT_SUSPENDED:'لا يمكن تسجيل الدخول بهذا الحساب. تواصل مع الدعم الفني.',
a_e_RATE_LIMITED:'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.', a_e_INVALID_OR_EXPIRED_TOKEN:'الرابط غير صالح أو منتهٍ.', a_e_ACCOUNTS_NOT_CONFIGURED:'الحسابات غير مفعّلة على الخادم بعد.',
a_e_ACCOUNTS_STARTING:'الخادم يستعد. حاول مرة أخرى بعد لحظات.', a_e_ACCOUNTS_UNAVAILABLE:'الحسابات غير متاحة مؤقتاً. حاول لاحقاً.', a_e_VALIDATION:'بعض القيم غير صحيحة.', a_e_SESSION_INVALID:'انتهت الجلسة. سجّل الدخول من جديد.',
a_f_invalid:'قيمة غير صحيحة.', a_f_too_short:'كلمة المرور قصيرة (10 أحرف على الأقل).', a_f_too_long:'كلمة المرور طويلة جداً.', a_f_common:'كلمة المرور شائعة وسهلة التخمين.', a_f_same_as_email:'كلمة المرور لا يجب أن تشبه البريد.', a_f_mismatch:'كلمتا المرور غير متطابقتين.', a_f_required:'هذا الحقل مطلوب.', a_f_empty:'لا يوجد ما يُحفظ.'
},
fa:{
a_title:'حساب من', a_sandbox:'حساب‌های آزمایشی (Sandbox): ایمیل واقعی ارسال نمی‌شود و پیوندهای فعال‌سازی و بازیابی رمز در صندوق ایمیل آزمایشی نزد مدیر دیده می‌شود. هیچ پول واقعی در کار نیست.',
a_login:'ورود', a_register:'ساخت حساب', a_forgot:'رمز را فراموش کرده‌اید؟', a_logout:'خروج', a_logoutAll:'خروج از همه دستگاه‌ها',
a_email:'ایمیل', a_password:'رمز عبور', a_password2:'تکرار رمز عبور', a_fullName:'نام کامل', a_phone:'شماره تلفن (اختیاری)', a_lang:'زبان', a_currentPw:'رمز عبور فعلی', a_newPw:'رمز عبور جدید',
a_pwHint:'رمز عبور حداقل ۱۰ نویسه باشد و رایج نباشد.', a_submitLogin:'ورود', a_submitRegister:'ساخت حساب', a_submitForgot:'ارسال پیوند بازیابی', a_submitReset:'ذخیره رمز جدید', a_save:'ذخیره', a_changePw:'تغییر رمز عبور', a_resend:'ارسال دوباره پیوند فعال‌سازی',
a_regDone:'حساب ساخته شد. پیوند فعال‌سازی را از ایمیل خود باز کنید و وارد شوید. (در نسخه آزمایشی پیوند نزد مدیر دیده می‌شود.)', a_forgotDone:'اگر این ایمیل ثبت شده باشد، پیوند بازیابی ارسال شد.', a_resendDone:'اگر حساب منتظر فعال‌سازی باشد، پیوند تازه ارسال شد.',
a_verifying:'در حال فعال‌سازی حساب...', a_verifyOk:'حساب شما فعال شد. اکنون می‌توانید وارد شوید.', a_verifyBad:'پیوند فعال‌سازی نامعتبر یا منقضی است.', a_goLogin:'رفتن به ورود',
a_resetTitle:'تعیین رمز عبور جدید', a_resetOk:'رمز عبور تغییر کرد. از همه دستگاه‌ها خارج شدید؛ دوباره وارد شوید.', a_resetBad:'پیوند بازیابی نامعتبر یا منقضی است.',
a_custNo:'شناسه مشتری', a_status:'وضعیت حساب', a_st_pending_verification:'منتظر فعال‌سازی', a_st_active:'فعال', a_st_restricted:'محدود', a_st_suspended:'تعلیق‌شده', a_st_closed:'بسته', a_verified:'ایمیل تأیید شده', a_notVerified:'ایمیل تأیید نشده', a_member:'عضویت از', a_lastLogin:'آخرین ورود',
a_restrictedNote:'حساب شما فعلاً محدود است: فقط می‌توانید اطلاعات خود را ببینید. با پشتیبانی تماس بگیرید.', a_saved:'ذخیره شد.', a_pwChanged:'رمز عبور تغییر کرد. از دستگاه‌های دیگر خارج شدید.', a_loggedOutAll:'از همه دستگاه‌ها خارج شدید.',
a_loading:'در حال بارگذاری...', a_waking:'سرور در حال بیدار شدن است... بار اول ممکن است تا یک دقیقه طول بکشد.',
a_e_generic:'خطایی رخ داد. دوباره تلاش کنید.', a_e_NETWORK:'اتصال به سرور ممکن نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.', a_e_TIMEOUT:'سرور کند پاسخ می‌دهد. کمی بعد دوباره تلاش کنید.',
a_e_INVALID_CREDENTIALS:'ایمیل یا رمز عبور درست نیست.', a_e_EMAIL_NOT_VERIFIED:'ابتدا باید ایمیل خود را فعال کنید.', a_e_ACCOUNT_SUSPENDED:'ورود با این حساب ممکن نیست. با پشتیبانی تماس بگیرید.',
a_e_RATE_LIMITED:'تلاش‌های زیاد. کمی صبر کنید و دوباره تلاش کنید.', a_e_INVALID_OR_EXPIRED_TOKEN:'پیوند نامعتبر یا منقضی است.', a_e_ACCOUNTS_NOT_CONFIGURED:'حساب‌ها هنوز روی سرور فعال نشده‌اند.',
a_e_ACCOUNTS_STARTING:'سرور در حال آماده‌سازی است. چند لحظه بعد دوباره تلاش کنید.', a_e_ACCOUNTS_UNAVAILABLE:'حساب‌ها موقتاً در دسترس نیستند. بعداً تلاش کنید.', a_e_VALIDATION:'برخی مقادیر درست نیستند.', a_e_SESSION_INVALID:'نشست تمام شد. دوباره وارد شوید.',
a_f_invalid:'مقدار نامعتبر.', a_f_too_short:'رمز عبور کوتاه است (حداقل ۱۰ نویسه).', a_f_too_long:'رمز عبور خیلی بلند است.', a_f_common:'رمز عبور رایج و قابل حدس است.', a_f_same_as_email:'رمز عبور نباید شبیه ایمیل باشد.', a_f_mismatch:'دو رمز عبور یکسان نیستند.', a_f_required:'این فیلد الزامی است.', a_f_empty:'چیزی برای ذخیره نیست.'
},
en:{
a_title:'My account', a_sandbox:'Sandbox accounts: no real e-mail is sent; activation and password-reset links go to the administrator in a test mailbox. No real money is involved.',
a_login:'Sign in', a_register:'Create account', a_forgot:'Forgot password?', a_logout:'Sign out', a_logoutAll:'Sign out of all devices',
a_email:'E-mail', a_password:'Password', a_password2:'Confirm password', a_fullName:'Full name', a_phone:'Phone (optional)', a_lang:'Language', a_currentPw:'Current password', a_newPw:'New password',
a_pwHint:'At least 10 characters, and not a common password.', a_submitLogin:'Sign in', a_submitRegister:'Create account', a_submitForgot:'Send reset link', a_submitReset:'Save new password', a_save:'Save', a_changePw:'Change password', a_resend:'Resend activation link',
a_regDone:'Account created. Open the activation link sent to your e-mail, then sign in. (In the sandbox the link is visible to the administrator.)', a_forgotDone:'If that e-mail is registered, a reset link has been sent.', a_resendDone:'If the account is waiting for activation, a new link has been sent.',
a_verifying:'Activating your account...', a_verifyOk:'Your account is active. You can sign in now.', a_verifyBad:'This activation link is not valid or has expired.', a_goLogin:'Go to sign in',
a_resetTitle:'Set a new password', a_resetOk:'Password changed. You were signed out of all devices; please sign in again.', a_resetBad:'This reset link is not valid or has expired.',
a_custNo:'Customer ID', a_status:'Account status', a_st_pending_verification:'Waiting for activation', a_st_active:'Active', a_st_restricted:'Restricted', a_st_suspended:'Suspended', a_st_closed:'Closed', a_verified:'E-mail verified', a_notVerified:'E-mail not verified', a_member:'Member since', a_lastLogin:'Last sign-in',
a_restrictedNote:'Your account is restricted: you can only view your details. Please contact support.', a_saved:'Saved.', a_pwChanged:'Password changed. Other devices were signed out.', a_loggedOutAll:'Signed out of all devices.',
a_loading:'Loading...', a_waking:'The server is waking up... the first request can take up to a minute.',
a_e_generic:'Something went wrong. Please try again.', a_e_NETWORK:'Could not reach the server. Check your connection and try again.', a_e_TIMEOUT:'The server is slow to answer. Please try again shortly.',
a_e_INVALID_CREDENTIALS:'Wrong e-mail or password.', a_e_EMAIL_NOT_VERIFIED:'Please verify your e-mail first.', a_e_ACCOUNT_SUSPENDED:'This account cannot sign in. Please contact support.',
a_e_RATE_LIMITED:'Too many attempts. Please wait a little and try again.', a_e_INVALID_OR_EXPIRED_TOKEN:'This link is not valid or has expired.', a_e_ACCOUNTS_NOT_CONFIGURED:'Accounts are not enabled on the server yet.',
a_e_ACCOUNTS_STARTING:'The server is getting ready. Please try again in a moment.', a_e_ACCOUNTS_UNAVAILABLE:'Accounts are temporarily unavailable. Please try later.', a_e_VALIDATION:'Some values are not valid.', a_e_SESSION_INVALID:'Your session ended. Please sign in again.',
a_f_invalid:'Invalid value.', a_f_too_short:'Password is too short (10 characters minimum).', a_f_too_long:'Password is too long.', a_f_common:'This password is too common.', a_f_same_as_email:'The password must not look like the e-mail.', a_f_mismatch:'The two passwords do not match.', a_f_required:'This field is required.', a_f_empty:'Nothing to save.'
}
};
const TT = window.T; for (const l of Object.keys(add)) Object.assign(TT[l], add[l]);
})();
