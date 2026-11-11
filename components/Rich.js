// Renders lesson text: **bold**, *italic* and line breaks. Plain text only, never HTML.
export default function Rich({ text }) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, j) =>
        part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong>
          : part.startsWith("*") && part.length > 2 ? <em key={j}>{part.slice(1, -1)}</em>
          : part)}
    </span>
  ));
}
