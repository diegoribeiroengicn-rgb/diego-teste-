import { redirect } from "next/navigation";

/** Rota antiga (combinava Prestadores+Cessionários numa lista só),
 * substituída por /m/cessionarios e /m/prestadores. Mantida só como
 * redirecionamento — quem já instalou o GAT Mobile como PWA antes
 * dessa mudança tem um ícone na tela inicial apontando para cá, e sem
 * esse redirect esse ícone passaria a abrir um 404 até a pessoa
 * reinstalar o app manualmente. */
export default function PaginaMobileBaixaAntiga() {
  redirect("/m/cessionarios");
}
