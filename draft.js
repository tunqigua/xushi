import { countChars, isBlank } from './layout.js';
export const TEXT_LIMIT = 120, FEEL_LIMIT = 20;
export const feelings = ['舒服', '有点烦躁', '舍不得结束', '没什么特别', '说不清'];
export function validateDraft({ text, feeling = '', custom = '' }) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|\p{Surrogate}/u.test(text)) return '文字含无法制成相纸的控制字符或不完整字符；原文已保留，请删除这些字符后再拍。';
  if (isBlank(text)) return '先写下一点文字，再按快门。';
  if (countChars(text) > TEXT_LIMIT) return `正文超过 ${TEXT_LIMIT} 个字符；原文已完整保留，请调整后再拍。`;
  if (feeling === 'custom' && countChars(custom) > FEEL_LIMIT) return `感受超过 ${FEEL_LIMIT} 个字符；内容已保留，请调整或取消选择。`;
  return '';
}
export function captureDraft(draft, date = new Date(), id = crypto.randomUUID()) {
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  const feel = draft.feeling === 'custom'
    ? (isBlank(draft.custom) ? null : Object.freeze({ source: 'custom', text: draft.custom }))
    : (feelings.includes(draft.feeling) ? Object.freeze({ source: 'preset', text: draft.feeling }) : null);
  const localDate = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  return Object.freeze({ id, text: draft.text, feel, createdAt: date.toISOString(), localDate });
}
