'use strict';
// E-mail abstraction. Stage 3A ships ONLY the sandbox adapter: messages go to the sandbox outbox table (read by the administrator),
// nothing is sent to the internet. Resend/Brevo can be added later as another adapter with the same send() signature,
// without touching the account logic.
const T = {
  verify: {
    ar: ['تفعيل حسابك في ميري إيران', 'مرحباً،\nلتفعيل حسابك افتح الرابط التالي (صالح 24 ساعة):\n{link}\nإذا لم تنشئ هذا الحساب فتجاهل الرسالة.'],
    fa: ['فعال‌سازی حساب میری ایران', 'سلام،\nبرای فعال‌سازی حساب خود این پیوند را باز کنید (۲۴ ساعت اعتبار دارد):\n{link}\nاگر شما این حساب را نساخته‌اید، این پیام را نادیده بگیرید.'],
    en: ['Activate your Miri Iran account', 'Hello,\nOpen this link to activate your account (valid for 24 hours):\n{link}\nIf you did not create this account, ignore this message.']
  },
  reset: {
    ar: ['استعادة كلمة المرور', 'مرحباً،\nلتعيين كلمة مرور جديدة افتح الرابط التالي (صالح ساعة واحدة):\n{link}\nإذا لم تطلب ذلك فتجاهل الرسالة، ولن يتغير شيء.'],
    fa: ['بازیابی رمز عبور', 'سلام،\nبرای تعیین رمز جدید این پیوند را باز کنید (یک ساعت اعتبار دارد):\n{link}\nاگر شما درخواست نکرده‌اید، نادیده بگیرید؛ چیزی تغییر نمی‌کند.'],
    en: ['Reset your password', 'Hello,\nOpen this link to set a new password (valid for 1 hour):\n{link}\nIf you did not ask for this, ignore it; nothing will change.']
  },
  exists: {
    ar: ['لديك حساب بالفعل', 'مرحباً،\nحاول شخص ما إنشاء حساب بهذا البريد، لكن لديك حساب بالفعل. إذا نسيت كلمة المرور فاستخدم "نسيت كلمة المرور" في صفحة الدخول.'],
    fa: ['شما از قبل حساب دارید', 'سلام،\nکسی تلاش کرد با این ایمیل حساب بسازد، اما شما از قبل حساب دارید. اگر رمز را فراموش کرده‌اید از «فراموشی رمز» استفاده کنید.'],
    en: ['You already have an account', 'Hello,\nSomeone tried to register with this e-mail, but you already have an account. If you forgot your password, use "Forgot password" on the login page.']
  },
  changed: {
    ar: ['تم تغيير كلمة المرور', 'مرحباً،\nتم تغيير كلمة مرور حسابك وتسجيل خروجك من الأجهزة الأخرى. إذا لم تكن أنت فاستعد كلمة المرور فوراً وتواصل مع الدعم.'],
    fa: ['رمز عبور تغییر کرد', 'سلام،\nرمز عبور حساب شما تغییر کرد و از دستگاه‌های دیگر خارج شدید. اگر شما نبودید فوراً رمز را بازیابی کنید و با پشتیبانی تماس بگیرید.'],
    en: ['Your password was changed', 'Hello,\nYour account password was changed and other devices were signed out. If this was not you, reset your password now and contact support.']
  }
};
function createMailer({ cfg, repo, logger = {} }) {
  const link = (kind, token) => cfg.frontendUrl + '#/' + kind + '/' + token;
  // c: client inside the caller's transaction, so the message exists only if the account change committed.
  async function send(c, { to, lang, template, token }) {
    const t = (T[template] || {})[lang] || (T[template] || {}).en; if (!t) throw new Error('UNKNOWN_TEMPLATE');
    const url = token ? link(template === 'verify' ? 'verify' : 'reset', token) : '';
    const body = t[1].replace('{link}', url);
    await repo.insertOutbox(c, { to, template, lang, subject: t[0], body });
    if (cfg.logLinks && url) { try { if (logger.info) logger.info('sandbox mail', { to, template, link: url }); } catch (_) { /* ignore */ } } // opt-in, sandbox only
  }
  return { send, mode: 'sandbox' };
}
module.exports = { createMailer, TEMPLATES: T };
