import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from model_benchmark import (COMBINATIONS, compose, edit_distance, normalized_text,
                             evaluate_ocr, evaluate_layout)


def region(alias='R001',text='가나다',label='text'):
    return {'alias':alias,'label':label,'textRedacted':text,'readingOrder':1,
            'bboxNorm':dict(x1=.1,y1=.1,x2=.4,y2=.4)}


class ModelBenchmarkTests(unittest.TestCase):
    def test_only_one_model_changes(self):
        base=COMBINATIONS[0][1:]
        for combo in COMBINATIONS[1:]:
            self.assertEqual(sum(a!=b for a,b in zip(base,combo[1:])),1)

    def test_edit_distance_and_normalization(self):
        self.assertEqual(edit_distance('abc','adc'),1)
        self.assertEqual(edit_distance('abc',''),3)
        self.assertEqual(normalized_text('가 나\n다'),'가나다')

    def test_compose_does_not_mutate(self):
        layout={'pages':[{'pageNumber':1,'regions':[region(text='old')]}]}
        ocr={'pages':[{'pageNumber':1,'regions':[region(text='new')]}]}
        result=compose(ocr,layout)
        self.assertEqual(result['pages'][0]['regions'][0]['textRedacted'],'new')
        self.assertEqual(layout['pages'][0]['regions'][0]['textRedacted'],'old')

    def test_ocr_missing_counts_as_error(self):
        data={'pages':[{'pageNumber':1,'regions':[]}]}
        result=evaluate_ocr(data,{'ocr':[{'page':1,'box':[0,0,1,1],'text':'90%','numeric':True}]})
        self.assertEqual(result['cer'],1)
        self.assertEqual(result['numericExact'],0)

    def test_layout_one_prediction_cannot_match_twice(self):
        data={'pages':[{'pageNumber':1,'regions':[region()]}]}
        ref={'page':1,'box':[.1,.1,.4,.4],'type':'text'}
        result=evaluate_layout(data,{'layout':[ref,ref]})
        self.assertEqual(result['matched'],1)
        self.assertIsNone(result['precision'])

    def test_easyocr_ndarray_is_bgr(self):
        from model_benchmark_stage import predict
        class Reader:
            def readtext(self,image,**kwargs):
                self.image=image
                return []
        reader=Reader()
        with patch('model_benchmark_stage.Image.open',return_value=Image.new('RGB',(1,1),(10,20,30))):
            self.assertEqual(predict('easyocr',reader,Path('unused.jpg')),[])
        self.assertEqual(reader.image[0,0].tolist(),[30,20,10])
        self.assertTrue(reader.image.flags['C_CONTIGUOUS'])


if __name__=='__main__':unittest.main()
