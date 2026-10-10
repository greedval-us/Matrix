export function downloadContent(content, fileName, mimeType) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  let attached = false;

  try {
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    attached = true;
    link.click();
  } finally {
    if (attached) document.body.removeChild(link);
    // Let the browser start consuming the Blob before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
