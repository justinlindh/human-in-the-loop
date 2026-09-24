'''Small floor plant: cream pot with a round leafy bush.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.pot_plant('p_', pot='pot_cream', seed=7), 'plant_small')
export()
