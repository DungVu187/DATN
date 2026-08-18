import {
  HOME_CATEGORY_FALLBACK_ICON,
  HOME_CATEGORY_ICON_REGISTRY,
} from "./homecategoryiconregistry";

const HomeCategoryIcon = ({ icon, className = "" }) => {
  const IconComponent = HOME_CATEGORY_ICON_REGISTRY[icon];
  const classes = `home-category-icon${className ? ` ${className}` : ""}`;

  if (IconComponent) {
    return (
      <span className={classes} aria-hidden="true">
        <IconComponent focusable="false" />
      </span>
    );
  }

  if (icon?.startsWith("fa-")) {
    return (
      <span className={classes} aria-hidden="true">
        <i className={`fa-solid ${icon}`} />
      </span>
    );
  }

  const FallbackIcon = HOME_CATEGORY_FALLBACK_ICON;
  return (
    <span className={classes} aria-hidden="true">
      <FallbackIcon focusable="false" />
    </span>
  );
};

export default HomeCategoryIcon;
