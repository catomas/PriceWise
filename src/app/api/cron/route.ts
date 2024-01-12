import Product from "@/lib/models/product.model";
import { connectToDB } from "@/lib/mongoose";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { scrapeAmazonProduct } from "@/lib/scraper";
import {
  getLowestPrice,
  getHighestPrice,
  getAveragePrice,
  getEmailNotifType,
} from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    connectToDB();

    const products = await Product.find({});

    if (!products) throw new Error("No products found");

    // 1. Scrape latest Product Details
    const updateProducts = await Promise.all(
      products.map(async (currenProduct) => {
        const scrapedProduct = await scrapeAmazonProduct(currenProduct.url);

        if (!scrapedProduct) throw new Error("No product found");

        const updatedPriceHistory = [
          ...currenProduct.priceHistory,
          {
            price: scrapedProduct.currentPrice,
          },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
        };

        const updatedProduct = await Product.findOneAndUpdate(
          {
            url: product.url,
          },
          product
        );

        // 2. Check each product status & send email if needed

        const emailNotifType = getEmailNotifType(scrapedProduct, currenProduct);

        if (emailNotifType && updatedProduct.users.lenght > 0) {
          const productInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url,
          };

          const emailContent = await generateEmailBody(
            productInfo,
            emailNotifType
          );

          const userEmails = updatedProduct.users.map(
            (user: any) => user.email
          );

          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    return NextResponse.json({
      message: "OK",
      data: updateProducts,
    });
  } catch (error) {
    throw new Error(`Error in GET: ${error}`);
  }
}
