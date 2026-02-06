import { STATE_OPTIONS } from '../config/states';

export default function StateSelector({ value, onChange, disabled }) {
  return (
    <select
      className="state-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Select state"
    >
      {STATE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
