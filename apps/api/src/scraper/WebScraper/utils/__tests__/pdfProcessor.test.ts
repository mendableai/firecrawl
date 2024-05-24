import * as pdfProcessor from '../pdfProcessor';

describe('PDF Processing Module - Integration Test', () => {
  it('should correctly process a simple PDF file without the LLAMAPARSE_API_KEY', async () => {
    delete process.env.LLAMAPARSE_API_KEY;
    const pdfContent = await pdfProcessor.fetchAndProcessPdf('https://s3.us-east-1.amazonaws.com/storage.mendable.ai/rafa-testing/test%20%281%29.pdf');
    expect(pdfContent.trim()).toEqual("Dummy PDF file");
  });

// We're hitting the LLAMAPARSE rate limit 🫠
//   it('should download and read a simple PDF file by URL', async () => {
//     const pdfContent = await pdfProcessor.fetchAndProcessPdf('https://s3.us-east-1.amazonaws.com/storage.mendable.ai/rafa-testing/test%20%281%29.pdf');
//     expect(pdfContent).toEqual("Dummy PDF file");
//   });

//   it('should download and read a complex PDF file by URL', async () => {
//     const pdfContent = await pdfProcessor.fetchAndProcessPdf('https://arxiv.org/pdf/2307.06435.pdf');

//     const expectedContent = 'A Comprehensive Overview of Large Language Models\n' +
//     '                       a                        a,∗            b,∗                         c,d,∗                   e,f                           e,f                     g,i\n' +
//     '   Humza Naveed         , Asad Ullah Khan          , Shi Qiu     , Muhammad Saqib               , Saeed Anwar        , Muhammad Usman              , Naveed Akhtar         ,\n' +
//     '                                                                     Nick Barnes      h, Ajmal Mian      i\n' +
//     '                                                   aUniversity of Engineering and Technology (UET), Lahore, Pakistan\n' +
//     '                                                     bThe Chinese University of Hong Kong (CUHK), HKSAR, China\n' +
//     '                                                        cUniversity of Technology Sydney (UTS), Sydney, Australia\n' +
//     '                                       dCommonwealth Scientific and Industrial Research Organisation (CSIRO), Sydney, Australia\n' +
//     '                                           eKing Fahd University of Petroleum and Minerals (KFUPM), Dhahran, Saudi Arabia\n' +
//     '                                   fSDAIA-KFUPM Joint Research Center for Artificial Intelligence (JRCAI), Dhahran, Saudi Arabia\n' +
//     '                                                        gThe University of Melbourne (UoM), Melbourne, Australia\n' +
//     '                                                       hAustralian National University (ANU), Canberra, Australia\n' +
//     '                                                       iThe University of Western Australia (UWA), Perth, Australia\n' +
//     '  Abstract\n' +
//     '     Large Language Models (LLMs) have recently demonstrated remarkable capabilities in natural language processing tasks and\n' +
//     '  beyond. This success of LLMs has led to a large influx of research contributions in this direction. These works encompass diverse\n' +
//     '  topics such as architectural innovations, better training strategies, context length improvements, fine-tuning, multi-modal LLMs,\n' +
//     '  robotics, datasets, benchmarking, efficiency, and more. With the rapid development of techniques and regular breakthroughs in\n' +
//     '  LLM research, it has become considerably challenging to perceive the bigger picture of the advances in this direction. Considering\n' +
//     '  the rapidly emerging plethora of literature on LLMs, it is imperative that the research community is able to benefit from a concise\n' +
//     '  yet comprehensive overview of the recent developments in this field. This article provides an overview of the existing literature\n' +
//     '  on a broad range of LLM-related concepts. Our self-contained comprehensive overview of LLMs discusses relevant background\n' +
//     '  concepts along with covering the advanced topics at the frontier of research in LLMs. This review article is intended to not only\n' +
//     '  provide a systematic survey but also a quick comprehensive reference for the researchers and practitioners to draw insights from\n' +
//     '  extensive informative summaries of the existing works to advance the LLM research.\n'
//     expect(pdfContent).toContain(expectedContent);
//   }, 60000); 

});