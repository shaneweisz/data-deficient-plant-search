/**
 * Icons for each taxon group using react-icons
 */

import { CSSProperties } from "react";
import { FaPaw, FaDove, FaFish, FaFrog, FaLeaf, FaBug } from "react-icons/fa";
import { GiMushroom, GiSnake } from "react-icons/gi";

interface TaxaIconProps {
  taxonId: string;
  className?: string;
  size?: number;
  style?: CSSProperties;
}

export default function TaxaIcon({ taxonId, className = "", size = 16, style }: TaxaIconProps) {
  const iconProps = {
    size,
    className,
    style,
  };

  switch (taxonId) {
    case "mammalia":
      return <FaPaw {...iconProps} />;

    case "aves":
      return <FaDove {...iconProps} />;

    case "reptilia":
      return <GiSnake {...iconProps} />;

    case "amphibia":
      return <FaFrog {...iconProps} />;

    case "fishes":
      return <FaFish {...iconProps} />;

    case "invertebrates":
      return <FaBug {...iconProps} />;

    case "plantae":
      return <FaLeaf {...iconProps} />;

    case "fungi":
      return <GiMushroom {...iconProps} />;

    default:
      return <FaLeaf {...iconProps} />;
  }
}
