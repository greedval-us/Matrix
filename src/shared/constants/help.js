export const help = {
  fio: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат ввода: только буквы, разделитель — пробел.</p><br/>
      <p style="text-indent: 1.5em;">Допустим ввод фамилии, имени, отчества по отдельности или в любой комбинации.</p><br/>
      <p style="text-indent: 1.5em;" class="text-yellow-400">⚠️ Чем меньше данных — тем дольше будет поиск.</p>
    </div>
  `,
  date_of_birth: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат ввода: числовой, через точку.</p><br/>
      <p style="text-indent: 1.5em;">Пример: <code>31.12.1990</code></p>
    </div>
  `,
  number: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат ввода: только цифры, без пробелов и символов.</p><br/>
      <p style="text-indent: 1.5em;">Для телефонов используйте международный формат <strong>без</strong> знака <code>+</code>.</p>
    </div>
  `,
  mail: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Буквенно-цифровой формат с допустимыми спецсимволами.</p><br/>
      <p style="text-indent: 1.5em;">После <code>@</code> можно использовать <code>*</code> — для поиска только по имени адреса.</p>
    </div>
  `,
  passport: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат ввода: только цифры, серия и номер без разделителей.</p><br/>
      <p style="text-indent: 1.5em;">Пример: <code>1234567890</code></p>
    </div>
  `,
  inn: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат: только цифры, без пробелов и знаков.</p><br/>
      <p style="text-indent: 1.5em;">РФ Юр.лица — 10 цифр, РФ Физ.лица — 12 цифр.</p>
      <p style="text-indent: 1.5em;">Беларусь (УНП) — 9 цифр. Украина (РНУКПН) — 10 цифр.</p>
      <p style="text-indent: 1.5em;">Казахстан (ИНН, БИН) — по 12 цифр.</p>
    </div>
  `,
  snils: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат: 11 цифр, без пробелов и разделителей.</p>
    </div>
  `,
  telegram: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Числовой идентификатор Telegram, без префикса <code>id</code> и без пробелов.</p>
    </div>
  `,
  vk: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Числовой идентификатор VK, без префикса <code>id</code> и без пробелов.</p>
    </div>
  `,
  facebook: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Числовой идентификатор Facebook, без префикса <code>id</code> и без пробелов.</p>
    </div>
  `,
  grz: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат: буквенно-числовой, без пробелов и региона.</p><br/>
      <p style="text-indent: 1.5em;">Пример: <code>A123BC</code></p>
      <p style="text-indent: 1.5em;">Разрешены только латинские буквы, визуально схожие с русскими: А, В, Е, К, М, Н, О, Р, С, Т, У, Х.</p>
    </div>
  `,
  vin: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">Формат: 17 символов, без пробелов и разделителей.</p><br/>
      <p style="text-indent: 1.5em;">Допустимы латинские буквы A–Z (кроме I, O, Q) и цифры.</p>
    </div>
  `,
  wildcards: `
    <div class="text-sm text-neutral-100">
      <p style="text-indent: 1.5em;">В запросах поддерживаются подстановочные символы:</p><br/>
      <p style="text-indent: 1.5em;"><code>?</code> — один любой символ (обязательный).</p><br/>
      <p style="text-indent: 1.5em;"><code>%</code> — любой символ или отсутствие (опциональный).</p>
    </div>
  `
}
