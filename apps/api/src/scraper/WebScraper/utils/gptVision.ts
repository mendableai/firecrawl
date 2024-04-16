export async function getImageDescription(
  imageUrl: string,
  backText: string,
  frontText: string
): Promise<string> {
  const { OpenAI } = require("openai");
  const openai = new OpenAI();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "What's in the image? You need to answer with the content for the alt tag of the image. To help you with the context, the image is in the following text: " +
                backText +
                " and the following text: " +
                frontText +
                ". Be super concise.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error generating image alt text:", error?.message);
    return "";
  }
}
