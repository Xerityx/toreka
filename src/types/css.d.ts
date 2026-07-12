// Type declarations for web-only CSS imports used by the Expo template.
declare module "*.module.css" {
  const styles: { [className: string]: string };
  export default styles;
}

declare module "*.css";
