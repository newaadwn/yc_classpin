"use client";

import Image from "next/image";
import Link from "next/link";
import ohPinLogo from "@/assets/logo/ohpin_logo.svg";
import { useLanguage } from "@/app/_controller/language-context";
import styles from "./pin-logo.module.css";

export function PinLogo({ href = "/" }: {
  href?: string;
}) {
  const { t } = useLanguage();
  return (
    <Link className={`${styles.root} pin-logo`} href={href} aria-label={`OhPin · ${t("common.home")}`}>
      <Image className={styles.image} src={ohPinLogo} alt="" loading="eager" />
    </Link>
  );
}
