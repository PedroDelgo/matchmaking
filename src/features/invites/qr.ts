import createQrCode from "qrcode-generator";
import { validatedInvitationUrl } from "./credential";

/** Real, local QR encoding. Four white modules around the symbol are retained. */
export function invitationQr(value: string) {
  const url = validatedInvitationUrl(value);
  const qr = createQrCode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  const modules = qr.getModuleCount(),
    quiet = 4,
    size = modules + quiet * 2;
  const matrix = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      row >= quiet &&
      column >= quiet &&
      row < quiet + modules &&
      column < quiet + modules
        ? qr.isDark(row - quiet, column - quiet)
        : false,
    ),
  );
  const path = matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
    )
    .join("");
  return { size, path, matrix };
}
