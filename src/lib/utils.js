import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function generateId(prefix, metadata = {}) {
  const { fabric, color, texture } = metadata;
  if (fabric && color && texture) {
    const id = Math.floor(1000 + Math.random() * 9000);
    // Compact SKU structure: FAB(3)-COL(2)-TEX(2)-ID(4)
    const fabCode = fabric.substring(0, 3).toUpperCase();
    const colCode = color.substring(0, 2).toUpperCase();
    const texCode = texture.substring(0, 2).toUpperCase();
    return `${fabCode}-${colCode}-${texCode}-${id}`;
  }
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Unit Conversions
// Base internal unit is Meters
const METERS_PER_ROLL = 50;
const YARDS_PER_METER = 1.09361;

export const conversions = {
  metersToRolls: (m) => Math.ceil(m / METERS_PER_ROLL),
  rollsToMeters: (r) => r * METERS_PER_ROLL,
  metersToYards: (m) => m * YARDS_PER_METER,
  yardsToMeters: (y) => y / YARDS_PER_METER,
  
  formatQty: (quantity, unit) => {
    const q = parseFloat(quantity);
    if (isNaN(q)) return "0 " + (unit || "Yards");
    
    const u = (unit || "Yards").toLowerCase();
    if (u === "rolls") {
      return `${q} Rolls (~${(q * METERS_PER_ROLL).toFixed(0)}m)`;
    }
    if (u === "yards") {
      return `${q} Yards (~${(q / YARDS_PER_METER).toFixed(1)}m)`;
    }
    if (u === "meters") {
      return `${q} Meters`;
    }
    return `${q} ${unit || "Yards"}`;
  }
};
