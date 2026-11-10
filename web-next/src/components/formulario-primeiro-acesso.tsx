"use client";

import { useRouter } from "next/navigation";
import { FormularioSenha } from "@/components/formulario-senha";

export function FormularioPrimeiroAcesso() {
  const router = useRouter();

  return (
    <FormularioSenha
      rotuloSenhaAtual="Senha temporária"
      aoSucesso={() => router.push("/inicio")}
    />
  );
}
