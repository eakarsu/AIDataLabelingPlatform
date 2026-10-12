import React from 'react';

export function fillEveryField(values, variant = 0, choices = {}) {
  const names = ['Wedding editorial', 'Portrait session', 'Commercial campaign'];
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (/(^id$|_id$|^file$|_file$|^files$|_files$|upload|created_at|updated_at)/.test(key) || (typeof File !== 'undefined' && value instanceof File)) return [key, value];
    if (key === 'ai_suggestions') return [key, {}];
    if (choices[key]) return [key, choices[key][variant % choices[key].length]];
    if (Array.isArray(value)) return [key, [`${names[variant]} example`, 'Review lighting and delivery requirements']];
    if (value && typeof value === 'object') return [key, { exposure: 0.2, contrast: 12, highlights: -20, white_balance: 'Daylight' }];
    if (typeof value === 'boolean') return [key, true];
    if (/date|deadline|valid_until/.test(key)) return [key, new Date(Date.now() + (variant + 7) * 86400000).toISOString().slice(0, key === 'scheduled_date' ? 16 : 10)];
    if (/email/.test(key)) return [key, `client${variant + 1}@example.com`];
    if (/photo_name|filename/.test(key)) return [key, ['wedding_first_look_001.jpg', 'portrait_studio_001.jpg', 'brand_product_001.jpg'][variant]];
    if (/budget|price|cost|amount/.test(key)) return [key, [2400, 650, 4200][variant]];
    if (/duration/.test(key)) return [key, [6, 2, 8][variant]];
    if (/crew|party_size/.test(key)) return [key, [3, 2, 5][variant]];
    if (/travel/.test(key)) return [key, [25, 8, 40][variant]];
    if (/deliverables/.test(key)) return [key, [250, 35, 80][variant]];
    if (/experience/.test(key)) return [key, [6, 4, 8][variant]];
    if (typeof value === 'number') return [key, [3, 2, 5][variant]];
    if (/location|address|market/.test(key)) return [key, ['Brooklyn Botanical Garden, New York', 'Daylight portrait studio, Boston', 'Product studio and waterfront, Chicago'][variant]];
    if (/status/.test(key)) return [key, 'Pending'];
    if (/tone/.test(key)) return [key, ['Warm and polished', 'Friendly and concise', 'Confident and professional'][variant]];
    if (/type/.test(key)) return [key, ['Wedding', 'Portrait', 'Commercial'][variant]];
    if (/title|name/.test(key)) return [key, names[variant]];
    return [key, `${names[variant]} example: prioritize natural light, clear client communication, backup equipment, a realistic schedule, and delivery of edited selections within 14 days. Flag assumptions before confirming costs or publishing work.`];
  }));
}

export function PresetButtons({ presets, onApply, disabled = false, title = 'Fill every field', description = 'Each example fills required and optional fields. Review and edit before generating.' }) {
  return <div className="ai-preset-bar"><div><strong>{title}</strong><p>{description}</p></div><div className="ai-actions">{presets.map((preset) => <button type="button" className="btn btn-secondary" key={preset.label} disabled={disabled} onClick={() => onApply(preset.values)}>{preset.label}</button>)}</div></div>;
}

export default function FullFieldPresets({ value, onChange, choices = {}, presets, disabled = false }) {
  const completePresets = presets || ['Wedding example', 'Portrait example', 'Commercial example'].map((label, index) => ({ label, values: fillEveryField(value, index, choices) }));
  return <PresetButtons presets={completePresets} disabled={disabled} onApply={(values) => onChange({ ...value, ...values })} />;
}
