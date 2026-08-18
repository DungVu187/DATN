const mongoose = require("mongoose");

const chipSchema = new mongoose.Schema({
  Color: {
    type: [String],
    require: true,
  },
  Shapes: {
    type: [String],
    require: true,
  },
  Frames: {
    type: [String],
    require: true,
  },
  ButtonCount: {
    type: [String],
    require: true,
  },
});

const brandSchema = new mongoose.Schema({
  Brand: {
    type: String,
    require: true,
  },
});

const sectionSchema = new mongoose.Schema({
  Section: [
    {
      name: {
        type: String,
        required: true,
      },
      value: {
        type: [String],
        default: [],
      },
      imgUrl: {
        type: String
      }
    },
  ],
});

const getUpdatedImgUrl = (originalUrl) => {
  if (!originalUrl) return originalUrl;

  const paths = ['/images/', '/section-images/'];
  for (const p of paths) {
    const idx = originalUrl.indexOf(p);
    if (idx !== -1) {
      return originalUrl.substring(idx);
    }
  }
  return originalUrl;
};

sectionSchema.post('init', function(doc) {
  if (doc.Section && Array.isArray(doc.Section)) {
    doc.Section.forEach(sec => {
      if (sec.imgUrl) {
        sec.imgUrl = getUpdatedImgUrl(sec.imgUrl);
      }
    });
  }
});

sectionSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (ret.Section && Array.isArray(ret.Section)) {
      ret.Section.forEach(sec => {
        if (sec.imgUrl) {
          sec.imgUrl = getUpdatedImgUrl(sec.imgUrl);
        }
      });
    }
    return ret;
  }
});

sectionSchema.set('toObject', {
  transform: (doc, ret) => {
    if (ret.Section && Array.isArray(ret.Section)) {
      ret.Section.forEach(sec => {
        if (sec.imgUrl) {
          sec.imgUrl = getUpdatedImgUrl(sec.imgUrl);
        }
      });
    }
    return ret;
  }
});

const Brand = mongoose.model("Brand", brandSchema);
const Chip = mongoose.model("Chip", chipSchema);
const Section = mongoose.model("Section", sectionSchema);
module.exports = {
  Brand,
  brandSchema,
  Chip,
  chipSchema,
  Section,
  sectionSchema,
};
