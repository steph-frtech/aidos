export type SereinePalette = {
  cream: string;
  creamDeep: string;
  paper: string;
  mist: string;
  mistSoft: string;
  sage: string;
  sageDeep: string;
  sageInk: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
};

export const sereinePalette: SereinePalette = {
  cream: "#F4F1EB",
  creamDeep: "#EAE4DA",
  paper: "#FBFAF6",
  mist: "#D6E0D9",
  mistSoft: "#E4ECE6",
  sage: "#7A9A8A",
  sageDeep: "#5C7A6C",
  sageInk: "#38483F",
  ink: "#1F2A26",
  inkSoft: "#4A574F",
  inkFaint: "rgba(31, 42, 38, 0.55)",
};

export const sereineAltPalettes: SereinePalette[] = [
  sereinePalette,
  {
    cream: "#F6F0EA",
    creamDeep: "#EAE0D2",
    paper: "#FCF8F2",
    mist: "#E8DAC8",
    mistSoft: "#F0E6D8",
    sage: "#B89A82",
    sageDeep: "#8E6E55",
    sageInk: "#5A4738",
    ink: "#2A1F18",
    inkSoft: "#5A4738",
    inkFaint: "rgba(42, 31, 24, 0.55)",
  },
  {
    cream: "#F0F2F4",
    creamDeep: "#DCE1E8",
    paper: "#F8FAFC",
    mist: "#D3DCE5",
    mistSoft: "#E1E7EE",
    sage: "#8FA3B8",
    sageDeep: "#5E7793",
    sageInk: "#3D4E62",
    ink: "#1E2530",
    inkSoft: "#465264",
    inkFaint: "rgba(30, 37, 48, 0.55)",
  },
];
