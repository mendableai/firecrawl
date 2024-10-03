const fs = require('fs');

function removeFailedURL (requestParams, response, context, ee, next) {
  const responseBody = JSON.parse(response.body)
  if (responseBody && responseBody.error) {
    console.log(responseBody.error)
  }
  
  // try {
  //   const responseBody = JSON.parse(response.body)
  //   if (responseBody && responseBody.data && responseBody.data.metadata && responseBody.data.metadata.statusCode !== 200) {
  //     const path = 'webpages.csv';
  //     const urlToRemove = responseBody.data.metadata.sourceURL;

  //     fs.readFile(path, 'utf8', (err, data) => {
  //       if (err) {
  //         console.error('Error reading file:', err);
  //         return;
  //       }
        
  //       const updatedData = data.replace(new RegExp(`(^|,)${urlToRemove}(,|$)`, 'mg'), '$1$2')
  //         .replace(/^\s*[\r\n]/gm, '') // Remove empty lines
  //         .replace(/^\s*,\s*[\r\n]/gm, ''); // Remove lines with only a comma

  //       fs.writeFile(path, updatedData, 'utf8', (err) => {
  //         if (err) {
  //           console.error('Error writing file:', err);
  //         }
  //       });
  //     });
  //   }
  // } catch (error) {
  //   console.error('Failed to process URL removal:', error);
  // }

  return next();
}

module.exports = {
  removeFailedURL: removeFailedURL
}