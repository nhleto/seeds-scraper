// Import puppeteer
import { mkConfig } from "export-to-csv";
import fs from "fs";
import puppeteer, { TimeoutError } from "puppeteer";

const csvConfig = mkConfig({ useKeysAsHeaders: true });
const fileName = "seeds.csv";
const values = [];

// try {
(async () => {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--window-size=800,600"],
  });

  // Create a page
  const page = await browser.newPage();

  await page.setViewport({
    width: 1600,
    height: 1200,
  });

  // Go to your site
  await page.goto("https://www.rareseeds.com/store");

  await autoScroll(page);

  // Extract the content from the div
  const categoryListContent = await page.evaluate(() => {
    const categoryList = document.querySelector(".CategoryPage-CategoryList");
    return categoryList.innerHTML;
  });

  var links = extractLinks(categoryListContent);

  try {
    if (links?.length > 0) {
      for (let i = 1; i < links.length; i++) {
        const link = links[i];
        await pageAction(page, link);
      }
    }
  } catch (error) {
    const csv = jsonToCsv(values);

    fs.writeFile(fileName, csv, (err) => {
      if (err) {
        console.error(err);
      }
    });

    return;
  }

  const csv = jsonToCsv(values);

  fs.writeFile(fileName, csv, (err) => {
    if (err) {
      console.error(err);
    }
  });

  // Close the browser
  await browser.close();
})();

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  });
}

function extractLinks(html, useFilter = true) {
  const links = [];
  const regex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (useFilter) {
      if (match[1].startsWith("/store/plants-seeds")) {
        links.push(`https://www.rareseeds.com${match[1]}`);
      }
    } else {
      links.push(`https://www.rareseeds.com${match[1]}`);
    }
  }
  return links;
}

async function pageAction(page, url) {
  await page.goto(url);

  let el;
  try {
    await page.waitForSelector("a.ProductCard-Link", { timeout: 5000 });
    el = await page.$$("a.ProductCard-Link");
  } catch (e) {
    if (e instanceof TimeoutError) {
      return;
    }
  }

  const textLinks = [];
  for (let i = 0; i < el.length; i++) {
    const element = el[i];
    const res = await (await element.getProperty("href")).jsonValue();
    textLinks.push(res);
  }

  const results = [];
  for (let i = 0; i < textLinks.length; i++) {
    const element = textLinks[i];
    const res = await scrapeText(page, element);
    results.push(res);
  }

  return results;
}

async function scrapeText(page, url) {
  await page.goto(url);
  await new Promise((r) => setTimeout(r, 500));

  let titles;
  try {
    await page.waitForSelector(".ProductPage-Title", { timeout: 3000 });
    // let value = await page.evaluate((el) => el.textContent, element);
    titles = await page.$$(".ProductPage-Title");
  } catch (e) {
    if (e instanceof TimeoutError) {
      return;
    }
  }

  let title = [];
  for (let i = 0; i < titles.length; i++) {
    const element = titles[i];
    const res = await page.evaluate((el) => el.textContent, element);
    title.push(res);
  }
  let combTitle = title.join("").trim();

  if (combTitle === "") {
    combTitle = await page.evaluate(() => {
      const titles = document.querySelectorAll(".ProductPage-Title");
      const content = Array.from(titles).map((title) => title.textContent);
      const title = content.join("");
      return title.trim();
    });
  }

  let shortDescription;
  try {
    await page.waitForSelector(".ProductActions-ShortDescription", {
      timeout: 3000,
    });
    shortDescription = await page.$$(".ProductActions-ShortDescription");
  } catch (e) {
    if (e instanceof TimeoutError) {
      return;
    }
  }

  let pageContent = { Title: combTitle, Description: "", Tips: "" };
  for (let i = 0; i < shortDescription.length; i++) {
    const element = shortDescription[i];
    const res = await page.evaluate((el) => el.textContent, element);
    if (i === 0) {
      pageContent.Description = res;
    } else {
      pageContent.Tips = res;
    }
  }

  console.log(pageContent);
  values.push(pageContent);
  return pageContent;
}

function jsonToCsv(items) {
  const header = Object.keys(items[0]);
  const headerString = header.join(","); // handle null or undefined values here
  const replacer = (key, value) => value ?? "";
  const rowItems = items.map((row) =>
    header
      .map((fieldName) => JSON.stringify(row[fieldName], replacer))
      .join(",")
  ); // join header and body, and break into separate lines
  const csv = [headerString, ...rowItems].join("\r\n");
  return csv;
}
